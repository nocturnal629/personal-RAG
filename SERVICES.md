# Services & Free Tier Reference

A quick reference for every external service this project uses, their free limits,
where to get credentials, and what to swap if they stop being free.

> Pricing changes. Verify at the links below before making decisions.

---

## Supabase (Database + Storage)

**What it does here:** Hosts the Postgres database (documents + chunks tables) with
the `pgvector` extension for vector similarity search.

**Free tier:** 2 projects, 500 MB database, 1 GB file storage, 50 MB max upload.
No time limit — free projects do pause after 1 week of inactivity (unpause is one click).

**Where to get keys:** Project Settings → API → `URL`, `anon key`, `service_role key`

**Env vars:**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

**Alternatives if needed:**
| Option | Notes |
|--------|-------|
| Neon | Postgres + pgvector, generous free tier, no pause |
| PlanetScale | MySQL only — no pgvector, would need schema rewrite |
| Local Postgres | Free forever, but no cloud deployment |

---

## Google Gemini API (LLM + Embeddings)

**What it does here:** Two things — `text-embedding-004` converts text chunks into
768-dim vectors, and `gemini-2.5-flash` generates the chat answers.

**Free tier:** Available via [Google AI Studio](https://aistudio.google.com/app/apikey)
(NOT Vertex AI — that's pay-per-use). Rate limits apply per minute, but for personal
use you rarely hit them. Limits as of mid-2025:

| Model | Free RPM | Free TPD |
|-------|----------|----------|
| gemini-2.5-flash | 10 | 250,000 tokens |
| text-embedding-004 | 1,500 | unlimited |

**Where to get key:** [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
Make sure the key is from AI Studio, not a Google Cloud / Vertex AI project.

**Env var:**
```
GEMINI_API_KEY=
```

**Alternatives if needed:**
| Option | Model | Notes |
|--------|-------|-------|
| Groq | llama-3.3-70b, etc. | Very fast, generous free tier; no native embeddings |
| Ollama | Any open model | Completely free, runs locally; no cloud without self-hosting |
| OpenRouter | Many models | Aggregates providers; some free models available |
| Cohere | Command R | Has a free trial tier; also has native embeddings |

For embeddings specifically (if you switch away from Gemini):
| Option | Dims | Notes |
|--------|------|-------|
| Jina AI | 768 / 1024 | Free tier: 1M tokens/month |
| Nomic Embed | 768 | Free via Ollama (local) or Nomic API |
| Cohere embed-v4 | 1024 | Free trial |

> If you switch embedding models, you must re-run the migration with the new
> vector dimension (e.g. `vector(1024)`) and re-embed all existing chunks.

---

## Background Jobs — Inline Pipeline (no extra service)

**What this project does:** The ingestion pipeline (extract → chunk → embed → store)
runs directly inside the `/api/ingest` route handler. The browser waits while the
server processes the document, then gets a definitive success or failure response.

This works because `export const maxDuration = 60` in the route gives Vercel Hobby
serverless functions 60 seconds — enough for most documents. (The old 10s limit only
applied to the Edge runtime.)

**No env vars needed. No account required.**

### If you later need async processing

For very large documents (many-page PDFs, entire books), inline processing may
time out. Upgrade paths:

| Option | Free tier | What changes |
|--------|-----------|--------------|
| QStash (Upstash) | 500 msg/day | POST to QStash instead of running inline; QStash calls `/api/process` |
| Inngest | Yes (limited) | Dedicated dashboard, retries, step UI; add back `inngest` package |
| Vercel Cron | 1 job/day Hobby | Too infrequent for on-demand use |

---

## Vercel (Hosting)

**What it does here:** Hosts the Next.js app and all API routes as serverless functions.

**Free tier (Hobby plan):** Unlimited personal projects, 100 GB bandwidth/month,
serverless functions up to 60s timeout, 12 deployments/day from Git push.

**No env vars needed** — configured in the Vercel dashboard or via `vercel env`.

**Alternatives if needed:**
| Option | Notes |
|--------|-------|
| Netlify | Similar free tier; Next.js support via adapter |
| Railway | $5/month after trial; simpler for full-stack |
| Fly.io | Free tier exists; needs Dockerfile |
| Self-host | Run `pnpm start` on any VPS (Hetzner, DigitalOcean, etc.) |

---

## Optional: SITE_PASSWORD

Not a service — just an env var. Set it to gate the entire app behind a simple
password (cookie-based, no user accounts). Leave blank for open access.

```
SITE_PASSWORD=your-secret-here
```

---

## Quick setup checklist

- [ ] Supabase: create project → run `supabase/migrations/001_init.sql` in SQL editor
- [ ] Gemini: get API key from AI Studio (not Vertex AI)
- [ ] Fill in `.env.local` (copy from `.env.example`) — only 4 vars needed now
- [ ] `pnpm dev` to run locally
- [ ] Deploy to Vercel: `vercel --prod` or connect GitHub repo in Vercel dashboard
