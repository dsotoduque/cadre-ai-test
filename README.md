# Cadre AI Support Chatbot

A customer support chatbot for Cadre AI, built as a take-home evaluation. It answers common
inbound questions about Cadre AI's business — grounded in real content from cadreai.com — and
escalates to a human-reviewable lead when it doesn't have the answer.

> Status: architecture + specs drafted, implementation not started. See `plan.md` for the
> execution phases and `specs/` for the approved scope.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router) | Fast to build, deploys to Vercel with zero config |
| Hosting | Vercel | Matches Next.js, trivial preview deploys |
| Database | Supabase (Postgres + pgvector) | One managed service for relational data and vector search |
| Embeddings | OpenAI `text-embedding-3-small` | Cheap, fast, standard choice for a small knowledge base |
| Chat model | Claude Haiku 4.5 (Anthropic) | Fast/cheap, sufficient for grounded FAQ answering + tool-calling for escalation |

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
6. Response streams back to the client.

**Third parties in the data path:** the query text is sent to OpenAI for embedding, and full
conversation turns are sent to Anthropic for generation. This is disclosed here explicitly —
nothing about using Supabase implies the data stays inside it.

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
| Chunking strategy | Recursive character/token splitting | Document-based chunking with semantic attributes (per-chunk metadata: section, topic, intent) | Recursive is cheap and low-latency per ingested token. Semantic chunking is more robust for precise retrieval — which matters most when a borderline answer decides whether the bot escalates correctly — but costs more: an extra pass (LLM or rule-based) to derive attributes during ingestion, more tokens processed, higher ingestion latency. Trade-off axis is **latency + cost per token vs. retrieval robustness**, revisited in `specs/02-rag-pipeline.md` |
| PII protection (leads/messages) | RLS deny-all (service role only) + minimal collection (email optional) + at-rest encryption via Supabase's managed infra | App-level column encryption (pgcrypto), retention/TTL policy, right-to-delete flow | RLS + minimization is the highest-leverage control for a v1 with no admin UI yet; column encryption and retention policy add real engineering (key management, cleanup jobs) that isn't justified before there's actual admin usage. Worth noting Cadre's own pitch is about disciplined data governance — this system should hold itself to the same bar as it scales |

## Scaling & hardening roadmap

Ordered roughly by what I'd do first if this went to production:

1. **Rate limiting** on `/api/chat` (Vercel + Upstash) — protects against cost blowout on the
   Anthropic/OpenAI bill.
2. **RLS everywhere it matters** (already on `leads`/`messages`; extend as new tables appear).
3. **Prompt-injection hardening** — retrieved chunks are already treated as data, not
   instructions; next step is an eval set that specifically probes for injection via KB content.
4. **Observability** — structured logs per turn (latency, token counts, retrieval hit/miss),
   a lightweight dashboard on top of a Supabase table rather than a new service.
5. **Idempotent ingestion** — `bot`'s ingestion script upserts by content hash so re-running it
   doesn't duplicate chunks; next step is scheduling it (cron) so KB content can be refreshed as
   cadreai.com changes.
6. **Add an ANN vector index** (IVFFlat/HNSW) once the KB grows past the point where an exact
   linear scan stays fast — see the chunking/index trade-off row above; this isn't automatic, it
   needs to be added deliberately.
7. **Upgrade chunking to document-based with semantic attributes** if retrieval precision on
   escalation-sensitive queries proves insufficient with recursive chunking — sacrifices
   ingestion latency and cost-per-token for more robust retrieval.
8. **PII hardening** — column-level encryption (pgcrypto) for `leads.email`, a retention/TTL
   policy or manual right-to-delete flow, and evaluating Anthropic's Zero Data Retention option
   once there's a real admin surface using this data.
9. **Real auth for `/admin`** — swap the env-secret gate for Supabase Auth + role check once
   there's more than one internal viewer.
7. **Multi-tenant KB** — because `bot` is already isolated behind a clean module boundary, adding
   a second client's knowledge base later is a matter of scoping `document_chunks` by tenant, not
   a rewrite.
8. **Eval suite for the RAG answers** — a fixed set of Q&A pairs (seeded from the acceptance
   criteria in `specs/00-product-spec.md`) run against the pipeline on every KB content change.

## Running locally

```bash
npm install
supabase start          # local Postgres + pgvector via Docker; prints keys on completion
cp .env.example .env.local
# paste SUPABASE_URL and SERVICE_ROLE_KEY from `supabase start` output into .env.local,
# add your own OPENAI_API_KEY / ANTHROPIC_API_KEY / ADMIN_SECRET
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
