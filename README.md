# personal-RAG

A single-user app for chatting with your own notes, PDFs, bookmarks, and articles. Upload documents, then ask questions — answers stream back with inline citations pointing to the exact source chunks.

Built as a learning project to understand RAG primitives without abstractions like LangChain.

---

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router, TypeScript) |
| Hosting | Vercel Hobby |
| Database + vectors | Supabase (Postgres + pgvector) |
| LLM | `gemini-3.1-flash-lite` |
| Embeddings | `gemini-embedding-001` (3072 dims) |
| UI | Tailwind v4 + shadcn/ui |

---

## How it works

### Ingestion (upload → chunks → vectors)

1. You upload a PDF, Markdown file, plain text, or paste a URL.
2. `/api/ingest` extracts raw text from the source format.
3. `lib/pipeline.ts` runs inline:
   - Splits text into overlapping ~2000-character chunks
   - Embeds each chunk with `gemini-embedding-001` (`RETRIEVAL_DOCUMENT` mode)
   - Bulk-inserts chunks + 3072-dim vectors into Supabase
4. Document status flips `pending → ready`.

### Chat (question → retrieval → streamed answer)

1. Your question is embedded with `gemini-embedding-001` (`RETRIEVAL_QUERY` mode).
2. A Postgres `match_chunks` function finds the 8 most similar chunks by cosine similarity (threshold 0.5) using an HNSW index on `halfvec(3072)`.
3. Retrieved chunks are assembled into a prompt with `[Source N]` labels.
4. `gemini-3.1-flash-lite` generates a cited answer — streamed back token by token via Server-Sent Events.
5. The UI renders a citation panel and the streaming answer simultaneously.

For a deeper walkthrough of every concept, see [HOW-RAG-WORKS.md](HOW-RAG-WORKS.md).

---

## Setup

### 1. Supabase

Create a project at [supabase.com](https://supabase.com), then run the migration in **SQL Editor → New query**:

```sql
-- paste contents of supabase/migrations/001_init.sql
```

### 2. Gemini API key

Get a key from [Google AI Studio](https://aistudio.google.com/apikey) (not Google Cloud / Vertex AI — that tier has no free quota).

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
SITE_PASSWORD=        # optional — gates the whole app behind a password
```

### 4. Run locally

```bash
pnpm install
pnpm dev
# → http://localhost:3000
```

### 5. Deploy

```bash
vercel --prod
# or connect the GitHub repo in the Vercel dashboard
```

Add the same env vars in **Vercel → Settings → Environment Variables**.

---

## Project structure

```
lib/
  gemini.ts          embed() + chatStream() wrappers
  chunking.ts        recursive character splitter
  pipeline.ts        chunk → embed → store (called by ingest route)
  retrieval.ts       vector search + prompt assembly
  db.ts              Supabase clients (admin + browser)
  schemas.ts         shared Zod types
  extractors/
    pdf.ts           PDF → text
    markdown.ts      Markdown → text
    url.ts           URL → text (Mozilla Readability)

app/api/
  ingest/            POST: extract, insert document, run pipeline
  documents/         GET: list  |  DELETE: by id
  chat/              POST: SSE streaming chat
  auth/              POST: validate SITE_PASSWORD

supabase/migrations/001_init.sql    schema + HNSW index + match_chunks RPC
```

---

## Tuning knobs

| Constant | File | Default | Effect |
|----------|------|---------|--------|
| `TARGET_CHARS` | `lib/chunking.ts` | 2000 | Chunk size — larger = more context per chunk, less retrieval precision |
| `OVERLAP_CHARS` | `lib/chunking.ts` | 200 | Overlap between chunks — prevents context loss at boundaries |
| `matchCount` | `lib/retrieval.ts` | 8 | Chunks retrieved per query — more = longer prompt, higher token cost |
| `similarityThreshold` | `lib/retrieval.ts` | 0.5 | Minimum cosine similarity — lower = more results but noisier |

---

## Further reading

- [HOW-RAG-WORKS.md](HOW-RAG-WORKS.md) — plain-English explanation of every RAG concept used here
- [SERVICES.md](SERVICES.md) — free tier limits, where to get credentials, upgrade paths
