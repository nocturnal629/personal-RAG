# Cursor Prompt: Personal RAG over My Content

## Context

I'm building a personal RAG (Retrieval-Augmented Generation) application that lets me chat with my own notes, bookmarks, PDFs, and saved articles. This is a weekend learning project, so I want the code to be clean and instructive — favor clarity over cleverness, leave comments where you make non-obvious choices, and prefer composable functions over deep abstractions.

I'm a Python developer comfortable with TypeScript. I work as an AI/ML engineer professionally, so I don't need basic concepts explained — but I *do* want you to flag any choices where there's a meaningful tradeoff (e.g., "I picked recursive chunking because X, but semantic chunking would be better if Y").

## Tech stack (all free tier)

- **Framework:** Next.js 15 (App Router) with TypeScript
- **Hosting:** Vercel Hobby
- **Database:** Supabase (Postgres + `pgvector` extension + Storage + Auth)
- **LLM:** Google Gemini API (`gemini-2.5-flash` for chat, `text-embedding-004` for embeddings) — use the official `@google/genai` SDK
- **Background jobs:** Inngest free tier (Vercel functions time out at 10s on Hobby, so anything involving multiple LLM calls or bulk embedding must go through Inngest)
- **UI:** Tailwind CSS + shadcn/ui components
- **Validation:** Zod for all API input/output schemas
- **Package manager:** pnpm

Do NOT use:
- LangChain or LlamaIndex (I want to understand the primitives directly; we'll add abstractions later only if they earn their keep)
- Pinecone, Weaviate, or any external vector DB (pgvector handles this)
- OpenAI (using Gemini's free tier for everything)

## Free-tier constraints to design around

- **Vercel functions:** 10s timeout on Hobby. Any operation that loops over many items or makes multiple LLM calls goes to Inngest.
- **Supabase:** 500MB Postgres, 1GB storage, 50MB max file upload via storage API. Design the schema to be efficient — store chunks normalized, don't duplicate document text.
- **Gemini:** Generous free tier but rate-limited per minute. Batch embedding calls where possible (the `text-embedding-004` endpoint supports batch input).
- **Inngest:** Free tier covers personal use easily. Use it for any multi-step background work.

## Phase 1 scope (MVP — what we're building this weekend)

A working RAG pipeline with:

1. Upload a document (PDF, .md, .txt) via a web UI, OR paste raw text, OR submit a URL
2. The system extracts text, chunks it, embeds it, and stores it in Supabase
3. A chat UI where I ask a question, the system retrieves top-k relevant chunks via vector similarity, stuffs them into a Gemini prompt, and streams the answer back
4. Each answer shows the source chunks it used as citations (with document title + chunk position)
5. A simple documents page listing what's been ingested, with the ability to delete a document (which cascades to its chunks)

Out of scope for Phase 1 (we'll add later):
- Hybrid search (BM25 + vector)
- Re-ranking
- Multi-user auth
- Chat history persistence beyond the current session
- Eval harness
- Agent-style multi-step retrieval

## Data model

Create a Supabase migration with these tables. Enable the `vector` extension first.

```sql
-- documents: one row per ingested source
create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null check (source_type in ('pdf', 'markdown', 'text', 'url')),
  source_url text,
  raw_content text not null,
  metadata jsonb default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- chunks: one row per chunk, with embedding
create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  token_count int,
  embedding vector(768),  -- Gemini text-embedding-004 outputs 768 dims
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index on chunks using hnsw (embedding vector_cosine_ops);
create index on chunks (document_id);
```

Also write a Postgres function `match_chunks(query_embedding vector, match_count int, similarity_threshold float)` that returns chunks ordered by cosine similarity, with a configurable threshold. We'll call this via Supabase RPC from the API route.

## File structure

```
/app
  /api
    /ingest/route.ts           # POST: accept upload/url/text, create document row, enqueue Inngest job
    /chat/route.ts             # POST: streaming chat endpoint
    /documents/route.ts        # GET: list, DELETE: by id
    /inngest/route.ts          # Inngest webhook handler
  /chat/page.tsx               # Chat UI
  /documents/page.tsx          # Document list + upload
  /layout.tsx
  /page.tsx                    # Landing → redirects to /chat

/lib
  /db.ts                       # Supabase client (server + browser)
  /gemini.ts                   # Gemini client wrapper, embed() and chat() functions
  /chunking.ts                 # Recursive text splitter
  /retrieval.ts                # Vector search + prompt assembly
  /extractors/
    pdf.ts                     # PDF → text (use pdf-parse or unpdf)
    markdown.ts                # MD → text (strip frontmatter, keep structure)
    url.ts                     # URL → text (use @mozilla/readability + jsdom, or defuddle)
  /schemas.ts                  # Zod schemas shared across API + client

/inngest
  /client.ts                   # Inngest client
  /functions/
    process-document.ts        # extract → chunk → embed → write chunks

/components
  /chat/                       # Chat UI components
  /documents/                  # Upload + list UI
  /ui/                         # shadcn components

/supabase
  /migrations/
    001_init.sql
```

## Implementation notes

### Chunking (`lib/chunking.ts`)
Implement a recursive character splitter: split on `\n\n`, then `\n`, then `. `, then ` `, then characters. Target ~500 tokens per chunk with ~50 token overlap. Use `tiktoken` or a rough chars/4 approximation for token counting (we don't need to be exact — Gemini's tokenizer differs anyway). Each chunk should preserve a reference to its position in the source so we can show "chunk 3 of 12" in citations.

### Embedding (`lib/gemini.ts`)
Wrap the Gemini SDK with two functions:
- `embed(texts: string[]): Promise<number[][]>` — batch up to 100 inputs per call, retry once on transient failure
- `chatStream(messages, context): AsyncIterable<string>` — returns a stream of text deltas

Set `taskType: "RETRIEVAL_DOCUMENT"` when embedding chunks and `taskType: "RETRIEVAL_QUERY"` when embedding the user's question. This is a small but real quality lift on Gemini's embedding model.

### Ingestion flow
1. `POST /api/ingest` validates input with Zod, inserts a `documents` row with `status='pending'`, returns the doc ID immediately, and sends an Inngest event.
2. Inngest function `process-document` does: extract → chunk → batch-embed → bulk insert chunks → update document status to `ready`. If any step fails, set status to `failed` with the error message.
3. Client polls `/api/documents` or uses Inngest's real-time updates for status.

### Retrieval (`lib/retrieval.ts`)
- Embed the query
- Call `match_chunks` RPC with `match_count=8`, `similarity_threshold=0.5`
- Assemble a prompt with a clear system instruction, the retrieved chunks formatted as `[Source N] {title} (chunk {i}): {content}`, and the user question
- Tell the model to cite sources inline like `[1]`, `[2]` and refuse to answer if context is insufficient

### Streaming chat
Use the Vercel AI SDK's `streamText` helper or implement SSE manually. Return the source chunks (id, title, chunk_index, similarity) as a separate JSON payload at the start of the stream so the UI can render citations alongside the streamed answer. Don't make the user wait for the full answer to see what sources were used.

### Citations UI
When the answer streams in, render `[1]`, `[2]` markers as clickable; clicking opens a side panel showing the full chunk text and document title. This is the single most important UI affordance for trust — make it good.

## Environment variables

Create `.env.local` with placeholders and a matching `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

## Step-by-step build order

Please build in this order and stop after each step for me to verify before moving on:

1. **Scaffold:** Next.js app, Tailwind, shadcn init, env file, Supabase client, basic landing page
2. **Database:** Migration file with tables + `match_chunks` function. Give me the SQL to run in Supabase SQL editor.
3. **Gemini wrapper:** `lib/gemini.ts` with `embed()` and `chatStream()`, plus a small test script in `/scripts/test-gemini.ts` I can run with `pnpm tsx`
4. **Chunking:** `lib/chunking.ts` with the recursive splitter, plus a unit test or example script
5. **Extractors:** PDF, markdown, URL — each as a pure function returning `{ title, text }`
6. **Inngest function:** `process-document` end-to-end, tested with a text input first
7. **Ingest API route:** wires upload/url/text → document row → Inngest event
8. **Document list UI:** upload form, list with status, delete button
9. **Retrieval + chat API:** `lib/retrieval.ts`, streaming chat route with citations payload
10. **Chat UI:** message list, streaming render, citation side panel
11. **Polish:** loading states, error handling, empty states, basic styling pass

## Code conventions

- TypeScript strict mode
- All API inputs and outputs validated with Zod
- Server components by default; client components only where interactivity requires it
- Async error handling: never silent failures — log with context, surface to UI when user-facing
- No `any` types; if you genuinely need an escape hatch use `unknown` and narrow
- Comment the *why*, not the *what* — especially around chunking sizes, similarity thresholds, and prompt structure, since I'll be tuning these
- Keep files under ~200 lines; split when they grow

## What I want from you right now

Start with **step 1 (scaffold)**. Show me the commands to run, the files to create, and the final folder state. Don't move to step 2 until I confirm step 1 works. When you make a choice that has a real alternative (e.g., `pdf-parse` vs `unpdf`), tell me what you picked and why in one sentence.

Ask me clarifying questions before starting if anything above is ambiguous.
