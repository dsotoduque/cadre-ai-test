# Spec 01: Data Model & Supabase Schema

Status: ✅ Implemented and verified locally (migrations `20260820000000_init.sql`,
`20260820000001_grants.sql` — see addendum).
Modules: `bot`, `chat`, `users` (schema only — no application logic here).

## Addendum: local vs. cloud RLS enforcement differs at the HTTP layer (found during deploy)

On the local Supabase instance, an anon-key request to a deny-all table returns `401 permission
denied` (no base `GRANT` exists for `anon`). On Supabase Cloud, the same request returns
`200 []` — cloud projects grant broad base `SELECT`/etc. to `anon`/`authenticated` by default at
the schema level, and RLS (zero policies, as configured here) is what actually filters every row
out. **Verified this is still secure, not just superficially quiet:** inserted a real `leads` row
via `service_role`, then confirmed an `anon`-key read returns `[]`, not the row. Both
environments result in zero accessible rows for `anon`/`authenticated` — they just signal "no
access" differently (401 vs. an empty result set). Documented so a future 200 response isn't
mistaken for a policy gap during review.

## Addendum: missing `service_role` grants (found during Phase 2)

`enable row level security` plus RLS bypass for `service_role` isn't sufficient on its own —
Postgres still requires base object privileges (`GRANT`) separately from RLS policies, and a
bare `create table` doesn't grant these automatically on a local Supabase instance. Ingestion
failed with `permission denied for table documents` until `20260820000001_grants.sql` explicitly
granted `select, insert, update, delete` on all 5 tables to `service_role`. This was a gap in
the original migration, not a new decision — fixed rather than re-litigated. `anon`/
`authenticated` still have no grants, so the deny-all RLS intent is unaffected.

## Problem

Every module needs persistent storage before any pipeline or API can be built: `bot` needs
somewhere to put chunked/embedded content, `chat` needs conversation history, `users` needs
escalation captures. This spec pins down the schema once so Phase 2+ doesn't invent tables
ad hoc mid-implementation.

## Design decisions

**Embedding dimension:** 1536 (matches OpenAI `text-embedding-3-small`, locked in
`CLAUDE.md`).

**Vector index:** none in v1. The KB is expected to be a handful of source documents (~7
knowledge domains from `specs/00-product-spec.md`), likely well under 1,000 chunks. At that
scale, an exact linear scan via pgvector's `<=>` operator is fast and simpler than tuning an
IVFFlat/HNSW index. Documented as a deferred optimization — see README scaling roadmap — revisit
if the KB grows materially.

**Idempotent ingestion:** both `documents` and `document_chunks` carry a `content_hash` (sha256
of the source content) with a unique constraint, so re-running ingestion upserts instead of
duplicating rows. This is what makes `bot.application.ingestDocument()` (Phase 02) safe to
re-run.

**Access model:** nothing in this app is queried directly from the browser — every table is
reached only through Next.js API routes running server-side with the Supabase service role key.
So RLS policy is uniform and simple: **enable RLS on every table, grant no policies to
`anon`/`authenticated`**, meaning only the service role (which bypasses RLS by design) can read
or write. No per-table bespoke policy logic needed in v1.

**Conversation/message roles:** `messages.role` is a `text` column constrained via `CHECK` to
`'user' | 'assistant'` — no separate `role` enum type, to keep migrations simple.

**Lead status:** `leads.status` defaults to `'new'`, constrained to `'new' | 'contacted'`. There
is no UI to change it yet (that's manual via Supabase Studio until Phase 04's admin view), but
having the column now avoids a schema migration later just to add it.

## PII handling

`leads.email` and free-text content in `leads.question`/`messages.content` are the only PII this
system touches. No other identifiers (IP, device fingerprint, tracking cookies) are collected.

- **Minimization:** email is optional and only stored if the user volunteers it during
  escalation — never required to use the bot.
- **Access control:** RLS deny-all (below) is the actual boundary — no anon/authenticated
  access to `leads` or `messages` under any circumstance, only the server-side service role.
- **Encryption at rest:** handled by Supabase's managed infrastructure by default; no
  application-level column encryption (e.g. pgcrypto) in v1 — see README trade-offs for why.
- **Third parties:** query text is sent to OpenAI (embeddings) and full conversation turns are
  sent to Anthropic (generation) as part of normal operation — disclosed in README, not assumed
  to stay inside Supabase.
- **Retention:** none in v1 — rows persist indefinitely. Deletion/TTL policy is deferred, see
  README scaling roadmap.

## Schema

```sql
-- extension
create extension if not exists vector;

-- bot module
create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_url text,
  content text not null,
  content_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  content_hash text not null unique,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

-- chat module
create table conversations (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'open' check (status in ('open', 'escalated', 'closed')),
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- users module
create table leads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete set null,
  question text not null,
  email text,
  status text not null default 'new' check (status in ('new', 'contacted')),
  created_at timestamptz not null default now()
);

-- RLS: deny-all for anon/authenticated on every table; service role bypasses RLS
alter table documents enable row level security;
alter table document_chunks enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table leads enable row level security;

-- retrieval RPC (bot module)
create or replace function match_documents(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  where 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;
```

## Acceptance criteria

1. `vector` extension enabled; all 5 tables created with the columns/constraints above.
2. RLS is enabled on all 5 tables, and no policies exist for `anon`/`authenticated` — verified by
   querying each table with the anon key and confirming it's rejected.
3. Inserting the same `documents.content_hash` twice via upsert (`on conflict do update`) updates
   the row instead of erroring or duplicating.
4. `match_documents(embedding, threshold, count)` returns chunks ordered by similarity descending
   and respects the threshold/count arguments.
5. Deleting a `document` cascades to its `document_chunks`; deleting a `conversation` cascades to
   its `messages` but only nulls `leads.conversation_id` (a lead should survive even if its
   conversation is later removed).

## Plan

- [x] Init Supabase project (local, via Supabase CLI + Docker) and confirm `vector` extension is
      available.
- [x] Write migration file under `/supabase/migrations/20260820000000_init.sql` implementing the
      schema above.
- [x] Apply migration locally and run the acceptance checks manually (`docker exec ... psql`).
- [x] Confirm anon-key access is blocked on all 5 tables — verified `leads` and `documents` both
      return `401 permission denied` via the REST API with the anon key.
- [ ] Commit migration with a descriptive message (pending — repo isn't a git repo yet).

**Verification notes:**
- Local stack runs with `realtime`, `storage`, `edge_runtime`, and `analytics` disabled in
  `supabase/config.toml` — not needed for this app and were causing container health-check
  failures on first `supabase start`. Re-enable individually if a later phase needs them.
- Idempotent upsert confirmed: inserting the same `content_hash` twice updates the existing row
  (same `id`, updated `content`) rather than erroring or duplicating.
- Cascade delete confirmed: deleting a `document` removes its `document_chunks`; deleting a
  `conversation` sets `leads.conversation_id` to `null` without removing the lead.

**Checkpoint:** schema and acceptance criteria verified locally. Ready to start
`02-rag-pipeline.md` (ingestion needs `documents`/`document_chunks` to exist) once approved.
