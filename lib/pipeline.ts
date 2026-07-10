import { supabaseAdmin } from './db'
import { embed, type EmbeddingMode } from './gemini'
import { chunkText } from './chunking'

// Runs the full ingestion pipeline for a document that already has raw_content
// stored in the DB. Called directly from the ingest API route.
//
// Steps: chunk → embed → bulk insert chunks → mark document ready
// If anything fails, the document status is set to 'failed' with the error message.
export async function runPipeline(
  documentId: string,
  rawContent: string,
  embeddingMode: EmbeddingMode = 'sequential'
): Promise<void> {
  const db = supabaseAdmin()

  await db
    .from('documents')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', documentId)

  try {
    // 1. Split the text into overlapping chunks
    const chunks = chunkText(rawContent)
    if (chunks.length === 0) throw new Error('No chunks produced — document may be empty')

    // 2. Embed all chunks. embed() processes in batches of 20 internally.
    const embeddings = await embed(chunks.map(c => c.content), 'RETRIEVAL_DOCUMENT', embeddingMode)

    // 3. Bulk insert — one round trip instead of one per chunk
    const rows = chunks.map((chunk, i) => ({
      document_id: documentId,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      token_count: chunk.tokenCount,
      embedding: embeddings[i],
    }))

    const { error: insertError } = await db.from('chunks').insert(rows)
    if (insertError) throw new Error(`Chunk insert failed: ${insertError.message}`)

    // 4. Mark the document as ready
    await db
      .from('documents')
      .update({ status: 'ready', updated_at: new Date().toISOString() })
      .eq('id', documentId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[pipeline] document ${documentId} failed:`, message)

    await db
      .from('documents')
      .update({ status: 'failed', error: message, updated_at: new Date().toISOString() })
      .eq('id', documentId)

    throw err
  }
}
