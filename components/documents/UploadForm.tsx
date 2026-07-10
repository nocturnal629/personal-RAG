'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Tab = 'text' | 'url' | 'file'
type EmbeddingMode = 'sequential' | 'bulk'

export default function UploadForm() {
  const [tab, setTab] = useState<Tab>('text')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [embeddingMode, setEmbeddingMode] = useState<EmbeddingMode>('sequential')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      let res: Response

      if (tab === 'file' && file) {
        const fd = new FormData()
        fd.append('file', file)
        if (title) fd.append('title', title)
        fd.append('embeddingMode', embeddingMode)
        res = await fetch('/api/ingest', { method: 'POST', body: fd })
      } else {
        const body =
          tab === 'text'
            ? { type: 'text', content: text, title: title || undefined, embeddingMode }
            : { type: 'url', url, title: title || undefined, embeddingMode }

        res = await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      if (!res.ok) {
        const err = await res.json()
        throw new Error(JSON.stringify(err))
      }

      setStatus('done')
      setMessage('Document ingested — processing in background.')
      setTitle('')
      setText('')
      setUrl('')
      setFile(null)
      router.refresh()
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  const tabs: Tab[] = ['text', 'url', 'file']

  return (
    <div className="border border-border rounded-xl bg-card p-6 space-y-4">
      <h2 className="font-semibold text-lg">Add Document</h2>

      {/* Tab selector */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'file' ? 'File (PDF/MD/TXT)' : t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Embedding mode toggle */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">Embedding mode:</span>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(['sequential', 'bulk'] as EmbeddingMode[]).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setEmbeddingMode(mode)}
              title={
                mode === 'sequential'
                  ? 'One chunk at a time — safe for free-tier quotas'
                  : 'Parallel batches — faster but may hit rate limits'
              }
              className={`px-3 py-1.5 capitalize transition-colors ${
                embeddingMode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground text-xs">
          {embeddingMode === 'sequential' ? 'Safe for free tier' : 'Faster, may hit quota'}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />

        {tab === 'text' && (
          <textarea
            placeholder="Paste your text here…"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={8}
            required
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
        )}

        {tab === 'url' && (
          <input
            type="url"
            placeholder="https://example.com/article"
            value={url}
            onChange={e => setUrl(e.target.value)}
            required
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        )}

        {tab === 'file' && (
          <input
            type="file"
            accept=".pdf,.md,.mdx,.txt"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            required
            className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
          />
        )}

        <button
          type="submit"
          disabled={status === 'loading'}
          className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {status === 'loading' ? 'Uploading…' : 'Ingest'}
        </button>

        {message && (
          <p className={`text-sm ${status === 'error' ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
            {message}
          </p>
        )}
      </form>
    </div>
  )
}
