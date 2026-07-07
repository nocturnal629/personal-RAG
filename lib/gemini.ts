import { GoogleGenAI } from '@google/genai'
import type { Content } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

// ── Embedding ─────────────────────────────────────────────────────────────────
//
// taskType matters for retrieval quality:
//   RETRIEVAL_DOCUMENT → when embedding chunks that will be stored
//   RETRIEVAL_QUERY    → when embedding the user's search question
// Using the wrong task type measurably degrades recall.

export async function embed(
  texts: string[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'
): Promise<number[][]> {
  const results: number[][] = []

  // Process in batches of 20 to stay within Gemini's free-tier rate limits.
  // text-embedding-004 supports single-content calls; we loop for clarity.
  const BATCH = 20
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH)
    const batchResults = await Promise.all(
      batch.map(text => embedOne(text, taskType))
    )
    results.push(...batchResults)
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
      model: 'text-embedding-004',
      contents: text,
      config: { taskType },
    })
    return response.embeddings?.[0]?.values ?? []
  } catch (err) {
    // Retry once on transient network/rate errors before giving up
    if (attempt === 0) {
      await sleep(1000)
      return embedOne(text, taskType, 1)
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
    model: 'gemini-2.5-flash',
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
