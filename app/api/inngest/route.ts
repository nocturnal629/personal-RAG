import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { processDocument } from '@/inngest/functions/process-document'

// Inngest requires GET, POST, and PUT handlers on the same route.
// Inngest's cloud calls this endpoint to trigger functions and check status.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processDocument],
})
