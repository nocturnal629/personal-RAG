import { NextRequest } from 'next/server'
import { ChatRequestSchema } from '@/lib/schemas'
import { retrieveChunks, buildPrompt } from '@/lib/retrieval'
import { chatStream } from '@/lib/gemini'
import type { GeminiMessage } from '@/lib/gemini'

// POST /api/chat — streaming chat endpoint using Server-Sent Events (SSE).
//
// SSE format used here (manual, not Vercel AI SDK):
//   event 1: data: {"type":"sources","chunks":[...]}
//   event 2+: data: {"type":"delta","text":"..."}
//   final:    data: [DONE]
//
// We send sources first so the UI can render citations while the answer
// is still streaming — the user doesn't have to wait for the full response.

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const parsed = ChatRequestSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { messages } = parsed.data
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
  if (!lastUserMessage) {
    return new Response('No user message found', { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }

      try {
        // Retrieve relevant chunks before streaming the answer
        const chunks = await retrieveChunks(lastUserMessage.content)
        send({ type: 'sources', chunks })

        // Build the prompt with retrieved context
        const { systemPrompt, userMessage } = buildPrompt(lastUserMessage.content, chunks)

        // Convert prior chat history to Gemini's format (role: 'model' not 'assistant')
        const history: GeminiMessage[] = messages
          .slice(0, -1) // exclude last user message (already in userMessage)
          .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }))

        const geminiMessages: GeminiMessage[] = [
          ...history,
          { role: 'user', parts: [{ text: userMessage }] },
        ]

        // Stream the answer token by token
        for await (const delta of chatStream(systemPrompt, geminiMessages)) {
          send({ type: 'delta', text: delta })
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[chat] error:', message)
        send({ type: 'error', message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
