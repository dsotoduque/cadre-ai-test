# Roadmap

Index of specs in execution order. Each spec contains its own design decisions, acceptance
criteria, and a `## Plan` checklist with a review checkpoint at the end. Do not start a spec's
`## Plan` without it being reviewed first, and do not start the next spec until the current one's
checkpoint is confirmed. Methodology details live in `CLAUDE.md`.

| # | Spec | Module(s) | Status | Summary |
|---|---|---|---|---|
| 00 | [00-product-spec.md](specs/00-product-spec.md) | all | ✅ Approved | Product scope, escalation policy, acceptance scenarios |
| 01 | [01-data-model.md](specs/01-data-model.md) | bot, chat, users | ✅ Verified locally | Supabase schema, RLS, pgvector setup |
| 02 | [02-rag-pipeline.md](specs/02-rag-pipeline.md) | bot | ✅ Verified locally | Ingestion, chunking strategy, embeddings, retrieval, escalation logic, system prompt |
| 03 | [03-chat-api-escalation.md](specs/03-chat-api-escalation.md) | chat, users | ✅ Verified locally | `/api/chat`, conversation persistence, escalation wiring |
| 04 | 04-admin.md | auth | ⬜ Not started — next | Env-secret gate + leads view |
| 05 | 05-ui-deploy.md | — | ⬜ Not started | Chat widget UI + Vercel/Supabase deploy |

**Current checkpoint:** `03-chat-api-escalation.md` is implemented and verified locally (all 8
acceptance criteria pass). Next: write and review `specs/04-admin.md` before building the
env-secret-gated leads view.
