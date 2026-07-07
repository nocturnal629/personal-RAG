import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'

// GET /api/documents — list all documents (most recent first)
export async function GET() {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('documents')
    .select('id, title, source_type, source_url, status, error, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ documents: data })
}

// DELETE /api/documents?id=<uuid> — delete a document and all its chunks
// (chunks are deleted via ON DELETE CASCADE on the FK)
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { error } = await db.from('documents').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: id })
}
