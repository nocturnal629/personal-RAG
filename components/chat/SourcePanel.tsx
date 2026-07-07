'use client'

import type { SourceChunk } from '@/lib/schemas'

interface Props {
  chunks: SourceChunk[]
  onClose: () => void
}

export default function SourcePanel({ chunks, onClose }: Props) {
  if (chunks.length === 0) return null

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium">Sources ({chunks.length})</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-lg leading-none"
          aria-label="Close sources"
        >
          ×
        </button>
      </div>
      <ul className="overflow-y-auto flex-1 divide-y divide-border">
        {chunks.map((chunk, i) => (
          <li key={chunk.id} className="px-4 py-4 space-y-1">
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-xs font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5">
                [{i + 1}]
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{chunk.document_title}</p>
                <p className="text-xs text-muted-foreground">
                  chunk {chunk.chunk_index + 1} · {(chunk.similarity * 100).toFixed(0)}% match
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-6">
              {chunk.content}
            </p>
          </li>
        ))}
      </ul>
    </aside>
  )
}
