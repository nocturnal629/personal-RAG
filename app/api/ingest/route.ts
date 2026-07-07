import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/db'
import { runPipeline } from '@/lib/pipeline'
import { extractMarkdown } from '@/lib/extractors/markdown'
import { extractPdf } from '@/lib/extractors/pdf'
import { extractUrl } from '@/lib/extractors/url'

// Allow up to 60 seconds — enough for most documents on Vercel Hobby.
// (The old 10s limit only applies to the Edge runtime; serverless functions get 60s.)
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('multipart/form-data')) {
      return handleFileUpload(req)
    }
    return handleJsonBody(req)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[ingest] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── Text / URL ─────────────────────────────────────────────────────────────────

const JsonSchema = z.object({
  type: z.enum(['text', 'url']),
  content: z.string().optional(),
  url: z.string().url().optional(),
  title: z.string().optional(),
})

async function handleJsonBody(req: NextRequest): Promise<NextResponse> {
  const body = await req.json()
  const parsed = JsonSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { type, content, url, title } = parsed.data
  const db = supabaseAdmin()

  let rawContent = ''
  let docTitle = title ?? ''
  let sourceUrl: string | null = null

  if (type === 'text') {
    if (!content) return NextResponse.json({ error: 'content required for type=text' }, { status: 400 })
    rawContent = content
    docTitle = title ?? `Note ${new Date().toLocaleDateString()}`
  }

  if (type === 'url') {
    if (!url) return NextResponse.json({ error: 'url required for type=url' }, { status: 400 })
    sourceUrl = url
    // Fetch and extract the article text before inserting the document row.
    // Previously this happened inside Inngest; now it runs inline.
    const extracted = await extractUrl(url)
    rawContent = extracted.text
    docTitle = title || extracted.title
  }

  const { data: doc, error } = await db
    .from('documents')
    .insert({
      title: docTitle,
      source_type: type,
      source_url: sourceUrl,
      raw_content: rawContent,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) throw new Error(`DB insert failed: ${error.message}`)

  // Run chunk → embed → store synchronously. The browser waits, but gains a
  // definitive success/failure response instead of having to poll for status.
  await runPipeline(doc.id, rawContent)

  return NextResponse.json({ documentId: doc.id })
}

// ── File upload (PDF / Markdown / Text) ───────────────────────────────────────

async function handleFileUpload(req: NextRequest): Promise<NextResponse> {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const titleOverride = formData.get('title') as string | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const filename = file.name
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''

  let rawContent = ''
  let title = titleOverride ?? ''
  let sourceType: 'pdf' | 'markdown' | 'text' = 'text'

  if (ext === 'pdf') {
    sourceType = 'pdf'
    const extracted = await extractPdf(buffer, filename)
    rawContent = extracted.text
    title = title || extracted.title
  } else if (ext === 'md' || ext === 'mdx') {
    sourceType = 'markdown'
    const extracted = extractMarkdown(buffer.toString('utf-8'), filename)
    rawContent = extracted.text
    title = title || extracted.title
  } else {
    sourceType = 'text'
    rawContent = buffer.toString('utf-8')
    title = title || filename.replace(/\.[^.]+$/, '')
  }

  const db = supabaseAdmin()
  const { data: doc, error } = await db
    .from('documents')
    .insert({
      title,
      source_type: sourceType,
      raw_content: rawContent,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) throw new Error(`DB insert failed: ${error.message}`)

  await runPipeline(doc.id, rawContent)

  return NextResponse.json({ documentId: doc.id })
}
