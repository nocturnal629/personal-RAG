-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query).

-- 1. Enable the pgvector extension so we can store and search embeddings.
create extension if not exists vector;

-- 2. One row per ingested document (the original source).
create table documents (
  id           uuid        primary key default gen_random_uuid(),
  title        text        not null,
  source_type  text        not null check (source_type in ('pdf', 'markdown', 'text', 'url')),
  source_url   text,
  raw_content  text        not null default '',  -- filled by Inngest for url/pdf types
  metadata     jsonb       not null default '{}'::jsonb,
  status       text        not null default 'pending'
                           check (status in ('pending', 'processing', 'ready', 'failed')),
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 3. One row per chunk of a document, with its embedding vector.
--    chunks are deleted automatically when their parent document is deleted (cascade).
create table chunks (
  id            uuid        primary key default gen_random_uuid(),
  document_id   uuid        not null references documents(id) on delete cascade,
  chunk_index   int         not null,
  content       text        not null,
  token_count   int,
  -- Gemini text-embedding-004 produces 768-dimensional vectors.
  embedding     vector(768),
  metadata      jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- HNSW (Hierarchical Navigable Small World) index for fast approximate nearest-neighbour search.
-- vector_cosine_ops = cosine distance; better than euclidean for normalized text embeddings.
create index on chunks using hnsw (embedding vector_cosine_ops);
create index on chunks (document_id);

-- 4. Stored function called via supabase.rpc('match_chunks', {...}).
--    Returns the top-k most similar chunks to a query embedding.
--    similarity = 1 - cosine_distance (range: -1 to 1; higher is more similar).
create or replace function match_chunks(
  query_embedding    vector(768),
  match_count        int     default 8,
  similarity_threshold float  default 0.5
)
returns table (
  id              uuid,
  document_id     uuid,
  chunk_index     int,
  content         text,
  metadata        jsonb,
  similarity      float,
  document_title  text
)
language sql stable
as $$
  select
    c.id,
    c.document_id,
    c.chunk_index,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity,
    d.title                               as document_title
  from chunks c
  join documents d on d.id = c.document_id
  where 1 - (c.embedding <=> query_embedding) > similarity_threshold
    and d.status = 'ready'
  order by c.embedding <=> query_embedding   -- order by distance (ascending = most similar first)
  limit match_count;
$$;
