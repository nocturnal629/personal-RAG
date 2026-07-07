'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DocumentRow } from '@/lib/schemas'

const STATUS_STYLES: Record<DocumentRow['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  ready: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

export default function DocumentList({ documents }: { documents: DocumentRow[] }) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const router = useRouter()

  async function handleDelete(id: string) {
    if (!confirm('Delete this document and all its chunks?')) return
    setDeletingId(id)
    try {
      await fetch(`/api/documents?id=${id}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  if (documents.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-xl p-12 text-center text-muted-foreground">
        <p className="text-sm">No documents yet. Add one above.</p>
      </div>
    )
  }

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-semibold">Documents ({documents.length})</h2>
      </div>
      <ul className="divide-y divide-border">
        {documents.map(doc => (
          <li key={doc.id} className="flex items-center gap-4 px-6 py-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{doc.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {doc.source_type.toUpperCase()}
                {doc.source_url && (
                  <>
                    {' · '}
                    <a
                      href={doc.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {new URL(doc.source_url).hostname}
                    </a>
                  </>
                )}
                {' · '}
                {new Date(doc.created_at).toLocaleDateString()}
              </p>
              {doc.error && (
                <p className="text-xs text-destructive mt-1 truncate">{doc.error}</p>
              )}
            </div>

            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLES[doc.status]}`}
            >
              {doc.status}
            </span>

            <button
              onClick={() => handleDelete(doc.id)}
              disabled={deletingId === doc.id}
              className="text-muted-foreground hover:text-destructive transition-colors text-xs disabled:opacity-50"
            >
              {deletingId === doc.id ? '…' : 'Delete'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
