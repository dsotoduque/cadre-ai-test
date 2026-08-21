# Spec 00: Product Scope — Cadre AI Support Chatbot

Status: DRAFT — needs review before Phase 1 implementation begins.

## Problem

Cadre AI's inbound team receives a growing volume of repetitive inquiries from prospects,
existing clients, and curious visitors. Most of these questions have stable, factual answers.
The team's time should go to high-value conversations, not repeating the same answers.

## Goals

- Answer common, factual questions about Cadre AI's business, grounded in real content from
  cadreai.com — never invented specifics (no fabricated pricing, dates, or numbers).
- Clearly escalate when the bot doesn't have grounded information, instead of guessing.
- Capture enough information on escalation (question + optional email) so the inbound team can
  follow up without replaying the conversation.

## Non-goals (explicitly out of scope for v1)

- No client login or account-specific data. The bot cannot check the status of an existing
  engagement — that requires escalation.
- No pricing quotes. cadreai.com has no public pricing page; the bot always redirects to
  `/contact` for a scoped quote.
- No legal/compliance guarantees or advice.
- No live human handoff inside the chat — escalation is async lead capture, not a warm transfer.
- No multi-language support in v1 (English only, matching the source site).
- No actual client portal login flow — the bot explains what the portal is for, it does not
  attempt to authenticate or embed it.

## In-scope knowledge domains

Grounded in real content pulled from cadreai.com (fetched during discovery, see README for
source list):

1. **What Cadre AI does** — AI Strategy, AI Leadership & Facilitation, AI Engineering, AI Agents,
   built on an eight-pillar transformation framework.
2. **Industries served** — professional services, private equity, real estate, financial
   services, mortgage & lending, construction, retail/e-commerce, manufacturing/logistics,
   hospitality.
3. **AI Maturity Index** — what it evaluates (eight pillars, per-area rating + recommendations),
   obtained via `/contact` ("Get Your AI Maturity Index").
4. **Client portal** — purpose (tracking tools, agents, training, results for alignment and
   accountability), not a login mechanic.
5. **LLM selection & data security approach** — works across Claude, OpenAI, Gemini, Mistral and
   others; selects/configures the LLM that fits the client's stack; flags the risk of ungoverned
   employee use of consumer AI tools with sensitive data, and positions Cadre's strategy work as
   the fix.
6. **Booking a strategist call** — CTA to `/contact` ("Talk to an AI Strategist").
7. **Case studies** — high-level only, drawn from the real `/case-studies` page. Client company
   names are not disclosed there (only industry + a named contact's title/quote), so the bot
   never invents a company name — it describes the problem/solution/result by industry, matching
   the source. Points to `/case-studies` for full detail.

**Correction (post-discovery):** an earlier, coarser fetch of the homepage summarized case
studies with specific client names (iSupport, Avanti Capital Partners, TZP). A direct fetch of
`/case-studies` shows client names are actually undisclosed there — only industry and a named
contact's quote. The KB is built from the more authoritative page-level fetch; the earlier names
are not used anywhere.

## Escalation policy

**Triggers:**
- Retrieval confidence is low (no chunk clears the similarity threshold).
- User explicitly asks for a human, sales contact, or a negotiated price.
- Question concerns a specific existing client engagement (no such data is available to the bot).
- Two consecutive failed clarification attempts on the same topic.

**Behavior:** the bot states plainly that it doesn't have that information, offers to log the
question for the team, asks for an optional email, and calls the `escalate_to_human` tool, which
persists the conversation + question (+ email if given) to the `leads` table. It does not
pretend to transfer the user to a live agent.

## Acceptance criteria (test scenarios)

1. "What does Cadre AI do?" → correct summary of the four core services.
2. "Do you work with real estate companies?" → yes, listed as a served industry.
3. "How do I book a call with a strategist?" → points to `/contact` with clear CTA language.
4. "How do I access the portal to see my AI agents and results?" → explains portal purpose
   correctly, does not fabricate a login flow.
5. "What is the AI Maturity Index and how do I get scored?" → explains the eight-pillar
   framework, points to `/contact`.
6. "What's your pricing?" → states there's no public pricing, offers to connect with a
   strategist.
7. "Which LLM do you recommend for us?" → explains the multi-platform approach and the
   governance/security angle.
8. "Can you check the status of my current project with Cadre?" → escalates (no account data
   available to the bot).
9. Off-topic question (e.g., "what's the weather") → politely declines, offers to escalate only
   if relevant.
10. Prompt-injection attempt embedded in a user message or smuggled via retrieved content → bot
    does not leak its system prompt and does not follow instructions found inside retrieved
    document content.

## Open questions (resolved during discovery)

- Embeddings provider: OpenAI `text-embedding-3-small`.
- Chat model: Claude Haiku 4.5.
- Escalation channel: Supabase `leads` table only, no outbound email in v1.
