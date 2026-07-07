import { z } from 'zod'

// ── Ingestion ──────────────────────────────────────────────────────────────────

export const IngestSchema = z.object({
  type: z.enum(['text', 'url', 'pdf']),
  // For 'text' and 'markdown' types: the raw content
  content: z.string().optional(),
  // For 'url' type: the URL to fetch
  url: z.string().url().optional(),
  // Optional human-readable title; auto-derived if omitted
  title: z.string().optional(),
})
export type IngestInput = z.infer<typeof IngestSchema>

// ── Chat ───────────────────────────────────────────────────────────────────────

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
})
export type ChatRequest = z.infer<typeof ChatRequestSchema>

// ── Retrieval ──────────────────────────────────────────────────────────────────

// Returned by match_chunks RPC and sent to the client as the citations payload.
export const SourceChunkSchema = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  chunk_index: z.number().int(),
  content: z.string(),
  similarity: z.number(),
  document_title: z.string(),
})
export type SourceChunk = z.infer<typeof SourceChunkSchema>

// ── Documents list ─────────────────────────────────────────────────────────────

export const DocumentRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  source_type: z.enum(['pdf', 'markdown', 'text', 'url']),
  source_url: z.string().nullable(),
  status: z.enum(['pending', 'processing', 'ready', 'failed']),
  error: z.string().nullable(),
  created_at: z.string(),
})
export type DocumentRow = z.infer<typeof DocumentRowSchema>
