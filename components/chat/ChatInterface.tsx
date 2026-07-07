'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import MessageList, { type Message } from './MessageList'
import SourcePanel from './SourcePanel'
import type { SourceChunk } from '@/lib/schemas'

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [panelSources, setPanelSources] = useState<SourceChunk[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const openPanel = useCallback((chunks: SourceChunk[]) => {
    setPanelSources(chunks)
  }, [])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const query = input.trim()
    if (!query || streaming) return

    setInput('')
    const userMsg: Message = { role: 'user', content: query }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setStreaming(true)

    // Placeholder for the streaming assistant response
    const assistantIdx = newMessages.length
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok || !res.body) {
        throw new Error(`API error: ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let sources: SourceChunk[] = []
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6)
          if (raw === '[DONE]') continue

          const event = JSON.parse(raw) as
            | { type: 'sources'; chunks: SourceChunk[] }
            | { type: 'delta'; text: string }
            | { type: 'error'; message: string }

          if (event.type === 'sources') {
            sources = event.chunks
          } else if (event.type === 'delta') {
            accumulated += event.text
            setMessages(prev => {
              const next = [...prev]
              next[assistantIdx] = { role: 'assistant', content: accumulated, sources }
              return next
            })
          } else if (event.type === 'error') {
            throw new Error(event.message)
          }
        }
      }

      // Finalise with sources attached
      setMessages(prev => {
        const next = [...prev]
        next[assistantIdx] = { role: 'assistant', content: accumulated, sources }
        return next
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setMessages(prev => {
        const next = [...prev]
        next[assistantIdx] = { role: 'assistant', content: `Error: ${msg}` }
        return next
      })
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        <MessageList
          messages={messages}
          streaming={streaming}
          onCitationClick={openPanel}
        />
        <div ref={bottomRef} />

        {/* Input bar */}
        <form
          onSubmit={handleSend}
          className="border-t border-border px-4 py-4 flex gap-3 bg-background"
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask something about your documents…"
            disabled={streaming}
            className="flex-1 px-4 py-2.5 border border-border rounded-xl bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {streaming ? '…' : 'Send'}
          </button>
        </form>
      </div>

      {/* Citation side panel */}
      {panelSources.length > 0 && (
        <SourcePanel chunks={panelSources} onClose={() => setPanelSources([])} />
      )}
    </div>
  )
}
