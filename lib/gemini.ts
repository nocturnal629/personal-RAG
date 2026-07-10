import { GoogleGenAI } from '@google/genai'
import type { Content } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

// ── Embedding ─────────────────────────────────────────────────────────────────
//
// taskType matters for retrieval quality:
//   RETRIEVAL_DOCUMENT → when embedding chunks that will be stored
//   RETRIEVAL_QUERY    → when embedding the user's search question
// Using the wrong task type measurably degrades recall.

export type EmbeddingMode = 'sequential' | 'bulk'

export async function embed(
  texts: string[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
  mode: EmbeddingMode = 'sequential'
): Promise<number[][]> {
  if (mode === 'bulk') {
    // Parallel batches of 20 — faster but risks 429s on free-tier quotas.
    const BATCH = 20
    const results: number[][] = []
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH)
      results.push(...(await Promise.all(batch.map(t => embedOne(t, taskType)))))
    }
    return results
  }

  // Sequential: one at a time with exponential backoff — safe for free tier.
  const results: number[][] = []
  for (const text of texts) {
    results.push(await embedOne(text, taskType))
  }
  return results
}

async function embedOne(
  text: string,
  taskType: string,
  attempt = 0
): Promise<number[]> {
  try {
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
      config: { taskType },
    })
    return response.embeddings?.[0]?.values ?? []
  } catch (err) {
    const status = (err as { status?: number }).status
    const isRateLimit = status === 429
    const maxAttempts = isRateLimit ? 4 : 1
    if (attempt < maxAttempts) {
      // Exponential backoff: 2s, 4s, 8s, 16s for rate limit; 1s for other errors
      const delay = isRateLimit ? 2000 * 2 ** attempt : 1000
      await sleep(delay)
      return embedOne(text, taskType, attempt + 1)
    }
    throw err
  }
}

// ── Chat streaming ─────────────────────────────────────────────────────────────
//
// Yields string deltas as the model generates them, so we can push them to
// the client via SSE without buffering the full response.

export type GeminiMessage = { role: 'user' | 'model'; parts: [{ text: string }] }

export async function* chatStream(
  systemPrompt: string,
  messages: GeminiMessage[]
): AsyncGenerator<string> {
  const stream = await ai.models.generateContentStream({
    model: 'gemini-3.1-flash-lite',
    contents: messages as Content[],
    config: { systemInstruction: systemPrompt },
  })

  for await (const chunk of stream) {
    const text = chunk.text
    if (text) yield text
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
