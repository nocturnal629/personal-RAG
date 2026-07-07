'use client'

import type { SourceChunk } from '@/lib/schemas'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: SourceChunk[]
}

interface Props {
  messages: Message[]
  streaming?: boolean
  onCitationClick: (chunks: SourceChunk[]) => void
}

export default function MessageList({ messages, streaming, onCitationClick }: Props) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Ask anything about your documents.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : 'bg-card border border-border rounded-bl-sm'
            }`}
          >
            {/* Render citation markers as clickable buttons */}
            {msg.role === 'assistant'
              ? renderWithCitations(msg.content, msg.sources ?? [], onCitationClick)
              : msg.content}

            {/* Show a blinking cursor while the last assistant message is streaming */}
            {msg.role === 'assistant' && streaming && i === messages.length - 1 && (
              <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse" />
            )}

            {/* Source pill: clicking opens the side panel */}
            {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && !streaming && (
              <button
                onClick={() => onCitationClick(msg.sources!)}
                className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <span>📄</span>
                <span>{msg.sources.length} source{msg.sources.length > 1 ? 's' : ''}</span>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// Replace [1], [2] etc. with clickable buttons that highlight the matching source.
function renderWithCitations(
  content: string,
  sources: SourceChunk[],
  onCitationClick: (chunks: SourceChunk[]) => void
): React.ReactNode {
  const parts = content.split(/(\[\d+\])/g)

  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/)
    if (!match) return <span key={i}>{part}</span>

    const index = parseInt(match[1], 10) - 1
    const source = sources[index]

    return (
      <button
        key={i}
        onClick={() => source && onCitationClick([source])}
        className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-primary/15 text-primary rounded hover:bg-primary/25 transition-colors mx-0.5 align-baseline"
        title={source?.document_title ?? 'Unknown source'}
      >
        {match[1]}
      </button>
    )
  })
}
