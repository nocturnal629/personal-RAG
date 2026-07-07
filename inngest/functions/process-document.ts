import { inngest } from '../client'
import { supabaseAdmin } from '@/lib/db'
import { embed } from '@/lib/gemini'
import { chunkText } from '@/lib/chunking'
import { extractUrl } from '@/lib/extractors/url'
import { extractPdf } from '@/lib/extractors/pdf'
import { extractMarkdown } from '@/lib/extractors/markdown'

// This function runs in Inngest (outside the 10s Vercel timeout) so it can
// safely make many embedding API calls and bulk-insert thousands of rows.
//
// Pipeline: fetch raw content (if needed) → chunk → embed → insert → mark ready
export const processDocument = inngest.createFunction(
  // Inngest v4: trigger is inside the options object (no longer a separate argument)
  { id: 'process-document', name: 'Process Document', retries: 2, triggers: [{ event: 'doc/process' }] },
  async ({ event, step }) => {
    const { documentId } = event.data as { documentId: string }
    const db = supabaseAdmin()

    // ── Step 1: Load document and mark as processing ───────────────────────
    const document = await step.run('load-document', async () => {
      const { data, error } = await db
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single()

      if (error || !document) throw new Error(`Document ${documentId} not found`)

      await db
        .from('documents')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', documentId)

      return data
    })

    // ── Step 2: Extract raw text (for url and pdf types) ──────────────────
    const rawContent = await step.run('extract-content', async () => {
      // For text/markdown types the API route already stored the content
      if (document.raw_content && document.raw_content.length > 10) {
        return document.raw_content
      }

      let extracted: { title: string; text: string }

      if (document.source_type === 'url' && document.source_url) {
        extracted = await extractUrl(document.source_url)
      } else if (document.source_type === 'pdf' && document.metadata?.base64) {
        const buffer = Buffer.from(document.metadata.base64 as string, 'base64')
        extracted = await extractPdf(buffer)
      } else if (document.source_type === 'markdown') {
        extracted = extractMarkdown(document.raw_content || '', document.title)
      } else {
        // Plain text — already stored
        return document.raw_content
      }

      // Update raw_content and title in DB for url/pdf
      await db
        .from('documents')
        .update({
          raw_content: extracted.text,
          title: document.title || extracted.title,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId)

      return extracted.text
    })

    // ── Step 3: Chunk the text ─────────────────────────────────────────────
    const chunks = await step.run('chunk-text', async () => {
      return chunkText(rawContent as string)
    })

    // ── Step 4: Embed all chunks ───────────────────────────────────────────
    // Each batch of chunk texts → array of 768-dim vectors
    const embeddings = await step.run('embed-chunks', async () => {
      const texts = (chunks as Array<{ content: string }>).map(c => c.content)
      return embed(texts, 'RETRIEVAL_DOCUMENT')
    })

    // ── Step 5: Bulk insert chunks ────────────────────────────────────────
    await step.run('insert-chunks', async () => {
      const rows = (chunks as Array<{ content: string; chunkIndex: number; tokenCount: number }>).map(
        (chunk, i) => ({
          document_id: documentId,
          chunk_index: chunk.chunkIndex,
          content: chunk.content,
          token_count: chunk.tokenCount,
          embedding: (embeddings as number[][])[i],
        })
      )

      const { error } = await db.from('chunks').insert(rows)
      if (error) throw new Error(`Chunk insert failed: ${error.message}`)
    })

    // ── Step 6: Mark document as ready ────────────────────────────────────
    await step.run('mark-ready', async () => {
      await db
        .from('documents')
        .update({ status: 'ready', updated_at: new Date().toISOString() })
        .eq('id', documentId)
    })

    return { documentId, chunkCount: (chunks as unknown[]).length }
  }
)

// If any step throws, Inngest will retry the whole function (up to `retries`).
// In production you'd want idempotent steps — e.g., delete existing chunks
// before re-inserting. For this MVP, a failed doc can be deleted and re-uploaded.
