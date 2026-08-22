# Cadre AI Support Chatbot

A customer support chatbot for Cadre AI, built as a take-home evaluation. It answers common
inbound questions about Cadre AI's business — grounded in real content from cadreai.com — and
escalates to a human-reviewable lead when it doesn't have the answer.

> **Live:** https://test-cadre.vercel.app
>
> Status: all 6 specs implemented and verified (locally and against the deployed app). See
> `plan.md` for the execution phases and `specs/` for design decisions and acceptance criteria.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router) | Fast to build, deploys to Vercel with zero config |
| Hosting | Vercel | Matches Next.js, trivial preview deploys |
| Database | Supabase (Postgres + pgvector) | One managed service for relational data and vector search |
| Model access | OpenRouter | Cadre AI's own key partner for model access; one API key covers both chat and embeddings, verified working for both |
| Embeddings | `openai/text-embedding-3-small` via OpenRouter | Cheap, fast, standard choice for a small knowledge base |
| Chat model | `anthropic/claude-haiku-4.5` via OpenRouter | Fast/cheap, sufficient for grounded FAQ answering + function-calling for escalation |

## Architecture

Modular monolith with DDD-lite domain boundaries, not microservices — a support chatbot doesn't
need distributed system complexity, but clean module boundaries make the codebase legible and
make future extraction straightforward if it's ever needed.

```
/modules
  /auth     internal Cadre team auth (admin access only — not chatbot visitors)
  /users    Lead domain (prospect captured on escalation)
  /chat     Conversation/Message entities, turn orchestration, escalation policy
  /bot      RAG pipeline: ingestion, chunking, embeddings, retrieval, LLM client
/app/api    interface layer — route handlers, call into modules' application/ layer only
```

Each module is layered `domain/ -> application/ -> infrastructure/`. The interface layer
(`app/api/**`) only calls a module's `application/` layer; it never reaches into another
module's `infrastructure/` directly. Full rationale and the hard rule live in `CLAUDE.md`.

### Data model (Supabase)

- `documents`, `document_chunks` (`embedding vector(1536)`) — the knowledge base, owned by `bot`.
- `conversations`, `messages` — chat history, owned by `chat`.
- `leads` — escalation captures (question, optional email, conversation reference), owned by
  `users`.

RLS is enabled on `leads` and `messages`; only the service role (server-side) can read/write
them — the anon key used by the browser never touches those tables directly.

### Request flow

1. User sends a message → `POST /api/chat`.
2. `chat` module persists the message, calls `bot.application.retrieveContext()`.
3. `bot` embeds the query, does a pgvector similarity search (`match_documents` RPC) against
   `document_chunks`.
4. `bot.application.generateAnswer()` builds the system prompt (fixed instructions + retrieved
   context, clearly delimited as data) and calls Claude Haiku 4.5, with `escalate_to_human`
   exposed as a tool.
5. If the model calls the escalation tool, `chat` hands off to `users.application.createLead()`.
6. Response returns to the client as a single JSON payload — no streaming in v1, see
   `specs/02-rag-pipeline.md` for why.

**Third parties in the data path:** the query text and full conversation turns are sent to
OpenRouter, which routes them to OpenAI (embedding) and Anthropic (generation) respectively.
This is disclosed here explicitly — nothing about using Supabase implies the data stays inside
it, and OpenRouter itself is a fourth party in that path, not just a pass-through.

### Retrieval calibration: the similarity threshold

`match_threshold` is the trigger for the deterministic escalation gate (`specs/02-rag-pipeline.md`)
— too high and the bot escalates questions it actually has good context for (defeats the point
of RAG); too low and irrelevant chunks leak into the system prompt as if they were grounded
context (risks answers that look grounded but aren't). It can't be picked analytically — it's
specific to the embedding model *and* this KB's content, so it was calibrated against real data
instead of guessed.

**Method:** query the pipeline at `match_threshold = 0` (no filtering) with a handful of control
questions — some clearly on-topic, some clearly off-topic — and look at where the raw cosine
similarity scores actually separate.

**What was measured** (`openai/text-embedding-3-small` via OpenRouter, against this KB):

| Query type | Example | Similarity range |
|---|---|---|
| Off-topic | "what's the weather like today", "favorite pizza topping" | ~0.05–0.06 |
| On-topic | "what does Cadre AI do?", "how do I book a call?" | ~0.35 (weakest relevant match) to ~0.90 (near-exact title match) |

The gap between noise (~0.06) and signal (~0.35+) is wide and clean for this KB. **Chosen value:
`match_threshold = 0.35`** — comfortably above the noise ceiling, comfortably below where real
content starts, so it doesn't cut off genuine-but-imperfect matches.

**This is not a one-time constant.** The original starting guess (0.75, picked before any real
data existed) excluded almost all genuinely relevant content — it wasn't just slightly off, it
was calibrated against an intuition about cosine similarity ("close to 1 = relevant") that
doesn't hold for this model/content combination. If the KB's size, topic breadth, or writing
style changes substantially, or the embedding model changes, this measurement should be redone
rather than assumed to still hold — see the eval-suite roadmap item below for making that
repeatable instead of manual.

## Scope decisions and trade-offs

| Decision | In v1 | Deferred | Why |
|---|---|---|---|
| Auth for chatbot visitors | None (anonymous) | — | No requirement for client-specific answers; adds complexity with no product value for v1 |
| Admin access to leads | Env-secret gate | Full Supabase Auth w/ roles | `modules/auth` seam exists, but building real login for one internal view isn't worth the budget in a 4-6h MVP |
| Escalation notification | Stored in `leads` table | Email/Slack notification | Keeps v1 free of an extra API key/integration; the data is there, notification is a follow-up hook |
| Pricing answers | Redirects to `/contact` | — | cadreai.com has no public pricing; inventing numbers would be a factual bug, not a feature |
| Client portal | Explains purpose only | Real portal / login flow | Out of brief's scope; the bot is support, not the product itself |
| Languages | English only | i18n | Source content (cadreai.com) is English-only |
| Vector similarity search | Exact linear scan (no ANN index) | IVFFlat/HNSW index on `document_chunks.embedding` | KB is expected to stay under ~1k chunks; an ANN index adds tuning overhead (lists/probes, recall vs. speed) with no payoff at this scale. **Implies:** scaling the KB materially requires adding an index — this isn't free later, it's a deferred cost |
| Chunking strategy | Hand-rolled recursive splitter (headers → paragraphs → sentences), no framework dependency | LangChain/LlamaIndex-based pipeline with document-based, semantic-attribute chunking | Hand-rolled recursive keeps `bot/infrastructure/chunking` dependency-free, fast, and cheap per ingested token — appropriate for a KB of ~7 curated documents. A framework-based pipeline buys precision (semantic-aware splits, richer document loaders) once the KB grows large/heterogeneous enough that hand-rolled logic stops scaling, at the cost of a heavier dependency, extra processing per chunk (attribute extraction), and higher ingestion latency. Trade-off axis is **latency + cost per token vs. retrieval robustness at scale**, revisited in `specs/02-rag-pipeline.md` |
| PII protection (leads/messages) | RLS deny-all (service role only) + minimal collection (email optional) + at-rest encryption via Supabase's managed infra | App-level column encryption (pgcrypto), retention/TTL policy, right-to-delete flow | RLS + minimization is the highest-leverage control for a v1 with no admin UI yet; column encryption and retention policy add real engineering (key management, cleanup jobs) that isn't justified before there's actual admin usage. Worth noting Cadre's own pitch is about disciplined data governance — this system should hold itself to the same bar as it scales |
| KB content freshness | Manual re-curation + re-run of the idempotent ingestion script | Automated hook: scheduled scrape of cadreai.com + change detection (ETag/hash diff) + auto re-ingest | An automated hook would reintroduce live scraping — the exact fragility (HTML changes, JS-rendered content, unattended failure handling) v1 deliberately avoids — plus cron infra, to solve staleness for content (service descriptions, industries served) that realistically changes on the order of months, not hours. Since `ingestDocument()` is already idempotent by content hash, manual re-ingestion is a cheap, low-risk update path; automating it isn't justified until there's evidence content changes often enough to need it |
| Escalation decision logic | Hybrid: deterministic similarity-threshold gate (cheap, catches "no relevant KB content" before calling Claude, can't hallucinate) + LLM tool-call `escalate_to_human` for semantic triggers a similarity score can't see (explicit human request, account-specific question) | Pure LLM judgment (rely on the model to always decide), or pure deterministic (threshold only, no tool-call) | Pure LLM judgment risks the model fabricating an answer instead of admitting weak retrieval — LLMs are unreliable at self-reporting "I don't know" under prompting alone. Pure deterministic is syntactic only: "I want to talk to a human" can score well against the "book a call" chunk and never trip the gate. Hybrid costs more implementation/testing surface (two escalation paths instead of one) but avoids both failure modes |
| Retrieval query scope | Embed only the latest user message | Multi-turn query rewriting (condense conversation history before embedding) | A typical inquiry is a self-contained, punctual question — doesn't need long-range context. Costs a known limitation: a follow-up like "what about real estate?" after "which industries do you serve?" can retrieve poorly since the reference to "industries" isn't in the embedded text. **Confirmed in testing:** because the escalation gate runs on retrieval alone, this specific case doesn't just answer poorly — it escalates and creates a `leads` row, even though the 3-message chat history (`specs/03-chat-api-escalation.md`) would have let the model answer correctly if retrieval had succeeded. That's real noise in the leads table, not just a UX rough edge. Full semantic multi-turn handling is v2 scope |

## Scaling & hardening roadmap

Ordered roughly by what I'd do first if this went to production:

1. **Rate limiting** on `/api/chat` (Vercel + Upstash) — protects against cost blowout on the
   OpenRouter bill.
2. **RLS everywhere it matters** (already on `leads`/`messages`; extend as new tables appear).
3. **Prompt-injection hardening** — retrieved chunks are already treated as data, not
   instructions; next step is an eval set that specifically probes for injection via KB content.
4. **Observability** — structured logs per turn (latency, token counts, retrieval hit/miss),
   a lightweight dashboard on top of a Supabase table rather than a new service.
5. **Idempotent ingestion** — `bot`'s ingestion script upserts by content hash so re-running it
   doesn't duplicate chunks. KB freshness stays a manual re-curation step by design (see trade-off
   table) — not something to automate until real evidence shows content changes often enough to
   justify the scraping/cron infra it would require.
6. **Add an ANN vector index** (IVFFlat/HNSW) once the KB grows past the point where an exact
   linear scan stays fast — see the chunking/index trade-off row above; this isn't automatic, it
   needs to be added deliberately.
7. **Upgrade chunking to document-based with semantic attributes** if retrieval precision on
   escalation-sensitive queries proves insufficient with recursive chunking — sacrifices
   ingestion latency and cost-per-token for more robust retrieval.
8. **Multi-turn query rewriting** — condense recent conversation history into the retrieval query
   instead of embedding only the latest message, once follow-up questions prove to be common
   enough to justify it (see the retrieval-query-scope trade-off above). This is the real fix for
   the gate-blocks-history interaction found in `specs/03-chat-api-escalation.md` — not a
   gate-level patch, which would either reintroduce hallucination risk or just be this item done
   under a different name.

   **Design sketch:** make the gate two-stage rather than one-shot. Stage 1 stays exactly as it
   is today (embed the latest message alone — cheap, and already measured to work well for the
   self-contained majority of queries). Only if stage 1 fails *and* the conversation has prior
   history, try stage 2: retrieve again with a history-enriched query (naive concatenation of
   recent turns + the message, or an LLM-rewritten standalone question — e.g. "what about real
   estate?" + "which industries do you serve?" → "does Cadre AI serve the real estate
   industry?"). Escalate only if stage 2 also fails. This keeps the fast/cheap path untouched for
   most turns and only pays the extra cost on the ambiguous minority.

   **Prerequisites before building this** (not just "it would be nice"): (a) the per-turn
   observability item above, to actually measure how much gate-triggered escalation volume is
   follow-up-ambiguity vs. genuinely unanswerable — building this blind isn't justified; (b) the
   eval suite item below, in place *first*, so precision/recall on the enriched-query path can be
   verified rather than assumed; (c) a latency/cost budget check if the rewrite step uses an
   extra model call, since that's a second round-trip on the retry path.

   **Why the sequencing is a hard requirement, not caution for its own sake:** a false negative
   here (gate escalates something answerable) costs a stray `leads` row — bounded, cheap, already
   measured. A false positive from a hastily-built stage 2 (history-enriched retrieval surfaces
   *something* above threshold that isn't actually relevant, and the model answers confidently
   from it) is a categorically worse failure — a plausible-sounding wrong answer, the exact
   failure mode the deterministic gate exists to prevent, and one that doesn't exist in the
   system today at all. That asymmetry matters more here than in a generic chatbot: Cadre AI's
   own pitch is disciplined AI governance, so a bot that occasionally fabricates with confidence
   is reputational damage to the product itself, not just a UX rough edge. Volume alone can never
   justify shipping this — a low false-positive rate is a non-negotiable gate, not a nice-to-have.

   **Concrete measurement plan** for deciding build-vs-leave-as-is:
   - *Passive logging* (cheap, always on) per gate-triggered turn: whether prior conversation
     history existed, and the top similarity score even when it didn't clear the threshold (not
     just pass/fail). From this: **eligible volume** = % of gate escalations with history present
     (if small, stop here — not worth building) and **near-miss ratio** = % of those with a top
     score close to 0.35 (e.g. 0.28–0.34) vs. far below it (a near-miss is a real stage-2
     candidate; a score near the 0.05–0.06 noise floor means enriching the query won't help no
     matter how it's phrased).
   - *Shadow-mode experiment* (only if the passive numbers look promising): run stage 2 offline
     against logged eligible cases — generate the hypothetical answer without showing it to any
     user — and label each as grounded/correct or plausible-but-wrong. From this: **recovery
     rate** (% of eligible cases stage 2 actually resolves correctly) and, critically, **false-
     positive rate** (% of stage-2 hits that are wrong when reviewed).
   - **Decision rule:** build only if eligible volume is meaningful *and* recovery rate is high
     *and* the false-positive rate is close to zero. If false-positive rate isn't close to zero,
     leave the gap as-is regardless of volume — per the asymmetry above, recurrence doesn't buy
     down that specific risk.

   **Not the same lever as chunking.** Document-based/semantic chunking (item 7 above) improves
   what content is retrievable — it doesn't fix this, because the ambiguity lives in the query
   ("what about real estate?" alone carries almost no signal pointing at "industries we serve"),
   not in how the KB is chunked. A related-but-distinct lever that could complement this: hybrid
   dense + sparse retrieval (vector similarity plus keyword/BM25 matching), where chunk-level
   topic metadata could catch a literal keyword match even when semantic similarity is weak due
   to a short, ambiguous query. That's its own separate decision, not a byproduct of this one.
9. **PII hardening** — column-level encryption (pgcrypto) for `leads.email`, a retention/TTL
   policy or manual right-to-delete flow, and evaluating data-retention options on OpenRouter
   and its upstream providers once there's a real admin surface using this data.
10. **Real auth for `/admin`** — swap the env-secret gate for Supabase Auth + role check once
    there's more than one internal viewer.
11. **Multi-tenant KB** — because `bot` is already isolated behind a clean module boundary, adding
    a second client's knowledge base later is a matter of scoping `document_chunks` by tenant, not
    a rewrite.
12. **Eval suite for the RAG answers** — a fixed set of Q&A pairs (seeded from the acceptance
    criteria in `specs/00-product-spec.md`) run against the pipeline on every KB content change.

## Open questions — TO VALIDATE

Not a decision, not a roadmap commitment — genuinely unresolved, needs investigation before it's
either of those.

**Prompt/context caching.** Two candidate cache breakpoints in `bot/infrastructure/llm/`:
1. The fixed instruction portion of the system prompt (identical on every request — the safe,
   always-applicable candidate).
2. Instructions + `<retrieved_context>` together — bigger savings, but the cache only hits when
   two requests retrieve the exact same top-k chunk set, which depends on how often real users
   ask near-duplicate FAQ-style questions.

Purely an infrastructure-layer concern if adopted — doesn't touch `application/` or `domain/`,
consistent with the module boundaries in `CLAUDE.md`.

What needs to be validated before this becomes a real decision either way:
- Whether Anthropic's `cache_control` passes through correctly via OpenRouter's OpenAI-compatible
  `chat.completions` endpoint for `anthropic/claude-haiku-4.5` — not yet confirmed empirically
  (unlike the embeddings and tool-calling routes, which were verified directly; see
  `specs/02-rag-pipeline.md`'s implementation notes for that methodology).
- Whether it's actually applicable to v1 as built (single-turn, no conversation history in the
  prompt — short-lived prompt per request) or whether it only becomes worth doing once multi-turn
  history is added (`specs/00`'s retrieval-query-scope trade-off, deferred to v2) and/or FAQ
  repeat-question volume is high enough for the cache-write cost to pay off.

## Running locally

```bash
npm install
supabase start          # local Postgres + pgvector via Docker; prints keys on completion
cp .env.example .env.local
# paste SUPABASE_URL and SERVICE_ROLE_KEY from `supabase start` output into .env.local,
# add your own OPENROUTER_API_KEY / ADMIN_SECRET
npm run ingest           # chunks + embeds content/kb/*.md into the local KB
npm run dev
```

The browser never talks to Supabase directly — only server-side API routes do, using the
service role key — so no Supabase key is ever exposed to the client.

`supabase/config.toml` has `realtime`, `storage`, `edge_runtime`, and `analytics` disabled; this
app doesn't use them and they were causing container health-check failures on first start on
this machine. Re-enable individually if a later phase needs one.

## Requirements coverage

See `specs/00-product-spec.md` for the full in-scope/out-of-scope breakdown and acceptance
criteria this build is evaluated against.
