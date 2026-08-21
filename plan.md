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
| 04 | [04-admin.md](specs/04-admin.md) | auth, users | ✅ Verified locally | Env-secret gate + leads view |
| 05 | [05-ui-deploy.md](specs/05-ui-deploy.md) | — | ✅ Deployed | Chat widget UI + Vercel/Supabase deploy — live at https://test-cadre.vercel.app |

**Current checkpoint:** All 6 specs (00-05) are implemented, verified, and deployed. The app is
live at https://test-cadre.vercel.app. Remaining work is Phase 9 (polish) from the original
plan — commit hygiene review, and confirming this roadmap matches what was actually built.
