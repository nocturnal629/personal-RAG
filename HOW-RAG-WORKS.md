# How This Personal RAG Works

A plain-English walkthrough of every concept in this project, tracing the path from "you upload a PDF" to "you get a cited answer".

---

## What is RAG?

**Retrieval-Augmented Generation** is a technique that gives an LLM access to a private knowledge base without fine-tuning the model.

The problem it solves: LLMs have a knowledge cutoff and no access to your personal notes. RAG bridges that gap by *retrieving* relevant snippets from your data and *stuffing them into the prompt* before asking the model to answer.

```
User question
      │
      ▼
  [Retrieve]  ←── vector similarity search over your documents
      │
      ▼
  [Augment]   ←── build a prompt: system prompt + retrieved chunks + question
      │
      ▼
  [Generate]  ←── LLM reads the context and answers with citations
      │
      ▼
 Cited answer
```

---

## Part 1: Ingestion Pipeline

When you upload a document, this sequence runs (mostly in Inngest, not the web server):

### Step 1 — Extract

Raw text is extracted from the source format:

| Format | How |
|--------|-----|
| PDF | `pdf-parse` walks the PDF byte stream and extracts text layer |
| Markdown | Strip YAML frontmatter, keep the rest as-is (LLMs understand markdown) |
| URL | Fetch HTML → `@mozilla/readability` extracts the article body (same as Firefox Reader Mode) |
| Plain text | Already text, no extraction needed |

### Step 2 — Chunk

The full document text is split into smaller overlapping pieces (~500 tokens each).

**Why chunk at all?** Two reasons:
1. You can't fit a 50-page PDF into a single prompt.
2. Vector similarity works better on focused paragraphs than on large documents.

**Why overlap?** A sentence cut in half at a chunk boundary would lose meaning. By repeating ~50 tokens from the end of chunk N at the start of chunk N+1, we ensure every sentence has context around it.

**Recursive character splitting** (what we use):
```
Split on "\n\n" (paragraphs) first.
  If a piece is still too big → split on "\n" (lines).
    Still too big → split on ". " (sentences).
      Still too big → split on " " (words).
        Still too big → split character by character.
After splitting, merge adjacent small pieces back together.
```

This preserves natural language boundaries as much as possible.

### Step 3 — Embed

Each chunk is converted to a **vector embedding** — a list of 768 numbers that represents its meaning in "semantic space".

We use Google's `text-embedding-004` model. Chunks with similar topics end up with vectors that are close together in 768-dimensional space.

```
"Paris is the capital of France"  →  [0.12, -0.87, 0.34, ...]   ← 768 numbers
"The Eiffel Tower is in Paris"    →  [0.11, -0.85, 0.36, ...]   ← nearby in space
"Python is a programming language" → [-0.43, 0.21, -0.67, ...]  ← far away
```

**Why `taskType: RETRIEVAL_DOCUMENT`?** Gemini's embedding model has two modes:
- `RETRIEVAL_DOCUMENT` — optimised for chunks that will be stored and searched
- `RETRIEVAL_QUERY` — optimised for search queries

Using the wrong mode measurably degrades retrieval quality.

### Step 4 — Store

Chunks (with their embeddings) are stored in Supabase's Postgres database using the `pgvector` extension. An **HNSW index** (Hierarchical Navigable Small World) is built on the embedding column for fast approximate nearest-neighbour search.

```sql
-- The embedding column holds the 768-dim vector
embedding vector(768)

-- HNSW index for fast similarity search
create index on chunks using hnsw (embedding vector_cosine_ops);
```

HNSW trades a small amount of accuracy for a large speedup. At personal-project scale it's effectively lossless.

---

## Part 2: Chat / Retrieval Pipeline

When you ask a question:

### Step 1 — Embed the query

Your question is embedded using `taskType: RETRIEVAL_QUERY`. This puts it in the same 768-dimensional space as the stored chunks.

### Step 2 — Vector similarity search

We compute **cosine similarity** between the query vector and every stored chunk vector. Cosine similarity measures the angle between two vectors, returning 1.0 for identical direction (very similar) and 0.0 for perpendicular (unrelated).

The `match_chunks` Postgres function does this efficiently:

```sql
1 - (c.embedding <=> query_embedding) as similarity
-- The <=> operator is cosine DISTANCE; 1 - distance = similarity
```

We return the top 8 chunks with similarity > 0.5 (both thresholds are tunable).

### Step 3 — Build the prompt

The retrieved chunks are formatted and prepended to your question:

```
[Source 1] "My Paris Notes" (chunk 3):
The Eiffel Tower was built in 1889 for the World's Fair...

[Source 2] "France Guide" (chunk 7):
Paris has been the capital of France since...

---

Question: When was the Eiffel Tower built?
```

The system prompt tells the model:
- Answer ONLY from the provided context
- Cite sources inline as [1], [2]
- If context is insufficient, say so (don't hallucinate)

### Step 4 — Stream the answer

Gemini generates a response and we stream it back token by token using **Server-Sent Events (SSE)**.

Before the answer starts, we immediately send the source chunks as a JSON event so the UI can display citations while the text is still generating.

SSE wire format:
```
data: {"type":"sources","chunks":[...]}

data: {"type":"delta","text":"The Eiffel"}

data: {"type":"delta","text":" Tower was"}

data: [DONE]
```

---

## The Data Model

```
documents (1)
    │
    └── chunks (many)
            │
            └── embedding vector(768)
```

One document → many chunks. Deleting a document cascades to delete all its chunks (via `ON DELETE CASCADE` on the foreign key).

---

## Key Tradeoffs Made

| Decision | Choice | Alternative | Why |
|----------|--------|-------------|-----|
| Chunking strategy | Recursive character split | Semantic chunking | Semantic needs one embedding per sentence — too costly on free tier |
| Vector DB | pgvector (in Postgres) | Pinecone, Qdrant | Avoids another service; Supabase already handles auth and storage |
| LLM | Gemini 2.5 Flash | GPT-4o, Claude | Free tier is genuinely generous; 2.5 Flash is fast |
| Streaming | Manual SSE | Vercel AI SDK | Forces you to understand how streaming actually works |
| Background jobs | Inngest | Vercel cron, background tasks | Vercel Hobby functions time out at 10s; embedding 100 chunks takes longer |
| Overlap | 200 chars (~50 tokens) | 0 (no overlap) | Prevents context loss at chunk boundaries |
| Similarity threshold | 0.5 | Lower (0.3) | Lower threshold → more results but noisier; tune based on your documents |

---

## How to Tune

The constants most worth adjusting are:

- `TARGET_CHARS = 2000` in `lib/chunking.ts` — chunk size. Larger = more context per chunk but less precision in retrieval.
- `OVERLAP_CHARS = 200` in `lib/chunking.ts` — overlap between chunks.
- `matchCount = 8` in `lib/retrieval.ts` — number of chunks to retrieve. More chunks = longer prompt = higher token cost.
- `similarityThreshold = 0.5` in `lib/retrieval.ts` — minimum similarity to include a chunk.

---

## File Map

```
lib/
  gemini.ts      ← Gemini API wrapper: embed() and chatStream()
  chunking.ts    ← Recursive character splitter
  retrieval.ts   ← Vector search + prompt assembly
  db.ts          ← Supabase client
  schemas.ts     ← Zod types shared across API and UI

lib/extractors/
  pdf.ts         ← PDF → text
  markdown.ts    ← Markdown → text (strips frontmatter)
  url.ts         ← URL → text (Readability)

inngest/
  client.ts                      ← Inngest client
  functions/process-document.ts  ← Full pipeline: extract→chunk→embed→store

app/api/
  ingest/route.ts    ← POST: create document, trigger Inngest
  documents/route.ts ← GET: list  |  DELETE: by id
  chat/route.ts      ← POST: SSE streaming chat
  inngest/route.ts   ← Inngest webhook handler

supabase/migrations/001_init.sql ← Tables + HNSW index + match_chunks function
```
