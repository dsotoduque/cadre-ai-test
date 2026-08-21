# Spec 03: Chat API & Escalation Wiring

Status: ✅ Implemented and verified locally against all 8 acceptance criteria.
Modules: `chat`, `users`. Touches `bot` (signature changes only, no new design).

## Problem

`specs/02-rag-pipeline.md` gives us `bot.application.generateAnswer()` callable directly, but
nothing persists conversations, exposes an HTTP endpoint, or actually turns an escalation into a
`leads` row. This spec wires those together behind `POST /api/chat`.

## Design decisions

### 1. API contract

`POST /api/chat`

Request (Zod-validated at the interface layer):
```ts
{
  conversationId?: string; // uuid, omit to start a new conversation
  message: string;         // 1-4000 chars
}
```

Response (200):
```ts
{
  conversationId: string;
  message: { role: "assistant"; content: string };
  escalated: boolean;
}
```

Errors: `400` (validation failure, with details), `404` (`conversationId` doesn't exist), `500`
(unexpected failure — DB/model call), each as `{ error: string }`. No streaming (locked in
`specs/02-rag-pipeline.md`); no rate limiting yet (deferred, see README roadmap).

### 2. Conversation lifecycle

- No `conversationId` in the request → `chat.application.sendMessage()` creates a new
  `conversations` row (`status: 'open'`) first, lazily — not created on page load.
- `conversationId` present but not found → `404`, not silently treated as "create a new one" —
  a stale client ID is a real error worth surfacing, not masking.
- After `bot.application.generateAnswer()` returns:
  - `type: "escalate"` → conversation status updates to `'escalated'`, a `leads` row is created.
  - `type: "answer"` → conversation stays `'open'`.
- `'closed'` (already in the `conversations` status check constraint per `specs/01-data-model.md`)
  has no v1 trigger — there's no "end conversation" action yet. Left unused rather than removing
  it from the schema, since it's an obvious near-term addition.

### 3. Escalation acknowledgment — hybrid source, mirroring the hybrid escalation gate

The user always needs to see *something* when a turn escalates, but the source of that text
differs depending on which of the two escalation mechanisms (`specs/02-rag-pipeline.md`) fired:

- **Deterministic gate fired** (no chunk cleared the threshold): the model was never called, so
  there is no model-generated text. Use a fixed constant acknowledgment.
- **Model called `escalate_to_human`**: the model reliably produces explanatory prose alongside
  the tool call (observed in Phase 2 testing). Use `message.content` from that response as the
  acknowledgment — more natural and specific than a canned string. Fall back to the same fixed
  constant if `message.content` is empty.

`BotAnswer`'s escalate variant gains an `acknowledgment: string` field populated from one of
these two sources in `bot.application.generateAnswer()`:

```ts
export type BotAnswer =
  | { type: "answer"; text: string }
  | { type: "escalate"; question: string; email?: string; acknowledgment: string };
```

### 4. Cross-module calls: application-to-application is the integration point

`chat.application.sendMessage()` calls `users.application.createLead()` directly when a turn
escalates. `CLAUDE.md`'s existing hard boundary rule only names the interface layer
(`app/api/**` → a module's own `application/`); it doesn't yet say how modules integrate with
each other. Clarifying explicitly: a module's `application/` layer may call another module's
`application/` layer — that's the correct cross-module integration point. It must never reach
into another module's `domain/` or `infrastructure/` directly. (`CLAUDE.md` gets this rule added
as part of this spec's Plan.)

### 5. Conversation-aware generation, single-turn retrieval (unchanged)

Retrieval (`bot.application.retrieveContext()`) still embeds only the latest message — that
trade-off from `specs/02-rag-pipeline.md` is unchanged. But the *generation* call to the chat
model now includes the **last 3 messages** from the conversation (fetched via
`chat.infrastructure`, oldest-first) alongside the new user message, so follow-ups like "what
about pricing for that?" resolve coherently even though retrieval itself doesn't use them.

This means `bot.application.generateAnswer()` and `bot.infrastructure.llm.callChatModel()` both
change shape:

```ts
// bot/application/generate-answer.ts
generateAnswer(
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[] = []
): Promise<BotAnswer>

// bot/infrastructure/llm/client.ts
callChatModel(params: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[]; // history + new user message
  tools: OpenAI.Chat.Completions.ChatCompletionTool[];
}): Promise<OpenAI.Chat.Completions.ChatCompletionMessage>
```

`history` is capped at 3 messages specifically to bound token cost while still giving real
continuity — not a token-budget calculation, a deliberately small starting cap.

### Implementation finding: the gate can block history before it's ever used

Found during acceptance testing, not part of the original design: the deterministic gate
(`specs/02-rag-pipeline.md`) runs on the *latest message alone*, **before** the model — and
therefore before `history` — is ever involved. A short, pronoun-heavy follow-up like "what about
real estate specifically?" fails retrieval in isolation (0 chunks clear the threshold) and
escalates immediately, even in a conversation where the immediately preceding turn was "which
industries do you serve?" and a human would obviously resolve the reference. The 3-message
history built in this spec never gets a chance to help in exactly the case it would help most.

This is a direct, previously-unstated consequence of the retrieval-query-scope trade-off already
accepted in `specs/00-product-spec.md` (retrieval embeds only the latest message) — not a new
bug. Two ways to fix it were considered and explicitly rejected for v1:
- **Relax the gate** (call the model even with no retrieved context, trusting the system prompt
  to prevent fabrication) — this reintroduces exactly the hallucination risk the gate exists to
  prevent, and effectively reverts to the "pure LLM judgment" approach already rejected in
  `specs/02-rag-pipeline.md`'s escalation design.
- **Fold history into the retrieval query** (embed recent messages + latest message together) —
  this *is* multi-turn query rewriting, already deliberately deferred to v2 in `specs/00`'s
  retrieval-query-scope row. Fixing this "quickly" now would mean quietly un-deferring that
  decision under time pressure rather than doing it properly.

**Decision: keep the gate as-is.** Accepted cost, stated plainly rather than glossed over: an
ambiguous follow-up creates a `leads` row that isn't a real "needs a human" case — it's a
retrieval artifact. This adds noise to the table the inbound team uses to prioritize real leads,
not just a cosmetic UX gap. **The correct future fix is proper multi-turn query rewriting**
(condense recent history into the retrieval query, not just the generation call) — already on
the README roadmap — which would let follow-ups like this retrieve correctly instead of merely
being answered fluently after retrieval already failed. That's the path to actually improving
this feature's precision, not a gate-level patch.

## Data flow for one turn

1. `POST /api/chat` — Zod validates the body.
2. `chat.application.sendMessage()`:
   a. Resolve or create the conversation.
   b. Persist the user's message.
   c. Fetch the last 3 messages (before this turn) for history.
   d. Call `bot.application.generateAnswer(message, history)`.
   e. If `escalate`: update conversation status, call `users.application.createLead()`, persist
      the acknowledgment as an assistant message.
      If `answer`: persist the answer text as an assistant message.
3. Route returns `{ conversationId, message, escalated }`.

## Acceptance criteria

1. `POST /api/chat` with no `conversationId` creates a conversation and returns a valid one.
2. `POST /api/chat` with an existing `conversationId` appends to that same conversation (message
   count grows, no new conversation row).
3. `POST /api/chat` with an unknown `conversationId` returns `404`.
4. An escalating turn creates exactly one `leads` row linked to the conversation, and the
   conversation's status becomes `'escalated'`.
5. A non-escalating turn leaves the conversation `'open'` and creates no `leads` row.
6. Gate-triggered escalation shows the fixed canned acknowledgment; tool-call-triggered
   escalation shows the model's own accompanying text.
7. A follow-up question that clears the retrieval gate on its own but is genuinely ambiguous
   without prior context (e.g. "What is the AI Maturity Index?" → "How do I get scored?")
   resolves coherently to the specific thing discussed, confirming history is actually reaching
   the model. (Note: a follow-up that *doesn't* clear the gate on its own, like "what about real
   estate?" after "which industries do you serve?", escalates instead regardless of history —
   see the implementation finding above. That's expected v1 behavior, not a criterion failure.)
8. An invalid body (missing `message`, or `message` over the length cap) returns `400` with a
   validation error, not a `500`.

## Plan

- [x] Add the cross-module application-to-application call rule to `CLAUDE.md`.
- [x] Update `bot`: `BotAnswer` type (`acknowledgment` field), `generateAnswer()` accepts
      `history`, `llm/client.ts` accepts a `messages` array instead of a single `userMessage`.
- [x] `chat/domain`: `Conversation`, `Message` types.
- [x] `chat/infrastructure`: conversations repository (create/find/update status), messages
      repository (add message, get last N).
- [x] `chat/application/send-message.ts`: orchestrates the data flow above.
- [x] `users/domain`: `Lead` type.
- [x] `users/infrastructure/leads-repository.ts`: create lead.
- [x] `users/application/create-lead.ts`.
- [x] `app/api/chat/route.ts`: Zod validation, calls `chat.application.sendMessage()`, maps
      errors to the right status codes.
- [x] Manually tested all 8 acceptance criteria via curl against the local dev server + direct DB
      checks — all pass (criterion 7's test case was corrected during testing, see implementation
      finding above).

**Checkpoint:** API contract and escalation wiring verified against all acceptance criteria.
Ready to start `04-admin.md` (the `/admin` leads view reads what this phase writes) once
approved.
