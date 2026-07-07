// Always fetch live data; don't statically render (needs DB + auth cookies)
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/db'
import UploadForm from '@/components/documents/UploadForm'
import DocumentList from '@/components/documents/DocumentList'
import type { DocumentRow } from '@/lib/schemas'
import Link from 'next/link'

// Server component: fetches document list on the server so the page loads
// with data already present (no loading spinner needed on initial render).
export default async function DocumentsPage() {
  const { data } = await supabaseAdmin()
    .from('documents')
    .select('id, title, source_type, source_url, status, error, created_at')
    .order('created_at', { ascending: false })

  const documents = (data ?? []) as DocumentRow[]

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="font-semibold">Documents</h1>
        <Link href="/chat" className="text-sm text-primary hover:underline">
          → Chat
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <UploadForm />
        <DocumentList documents={documents} />
      </main>
    </div>
  )
}
