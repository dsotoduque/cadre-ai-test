-- Spec: specs/01-data-model.md
-- Extension for vector similarity search
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
