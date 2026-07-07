import { Inngest } from 'inngest'

// Inngest client shared by all functions and the route handler.
// The `id` must be unique within your Inngest account.
export const inngest = new Inngest({ id: 'personal-rag' })
