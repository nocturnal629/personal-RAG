import { supabaseAdmin } from './db'
import { embed } from './gemini'
import type { SourceChunk } from './schemas'

// Retrieve the most relevant chunks for a query using vector similarity.
// match_count=8 and threshold=0.5 are tunable:
//   - More chunks → more context but higher token cost and possible noise.
//   - Lower threshold → more results but potentially irrelevant ones.
export async function retrieveChunks(
  query: string,
  matchCount = 8,
  similarityThreshold = 0.5
): Promise<SourceChunk[]> {
  const [queryEmbedding] = await embed([query], 'RETRIEVAL_QUERY')

  const { data, error } = await supabaseAdmin()
    .rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      similarity_threshold: similarityThreshold,
    })

  if (error) throw new Error(`match_chunks RPC failed: ${error.message}`)

  return (data as SourceChunk[]) ?? []
}

// Builds the system prompt and context string that gets stuffed into the
// Gemini request. The format matters: explicit [Source N] labels let the
// model cite inline and let us map citations back to the actual chunks.
export function buildPrompt(
  query: string,
  chunks: SourceChunk[]
): { systemPrompt: string; userMessage: string } {
  const contextBlock = chunks
    .map(
      (chunk, i) =>
        `[Source ${i + 1}] "${chunk.document_title}" (chunk ${chunk.chunk_index + 1}):\n${chunk.content}`
    )
    .join('\n\n---\n\n')

  const systemPrompt = `You are a helpful assistant with access to the user's personal notes and documents.
Answer based ONLY on the provided context. If the context doesn't contain enough information to answer, say so clearly — do not guess or use outside knowledge.
When you use information from the context, cite the source inline like [1], [2], etc., matching the [Source N] labels below.
Be concise and accurate.`

  const userMessage = `Context:\n${contextBlock}\n\n---\n\nQuestion: ${query}`

  return { systemPrompt, userMessage }
}
