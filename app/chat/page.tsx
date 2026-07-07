import ChatInterface from '@/components/chat/ChatInterface'
import Link from 'next/link'

export default function ChatPage() {
  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
        <h1 className="font-semibold">Personal RAG</h1>
        <Link href="/documents" className="text-sm text-primary hover:underline">
          Manage documents →
        </Link>
      </header>

      {/* ChatInterface must fill remaining height for scroll to work */}
      <div className="flex-1 min-h-0">
        <ChatInterface />
      </div>
    </div>
  )
}
