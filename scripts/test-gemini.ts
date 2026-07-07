/**
 * Quick smoke-test for the Gemini wrapper.
 * Run with:  pnpm tsx scripts/test-gemini.ts
 *
 * Make sure GEMINI_API_KEY is set in .env.local before running.
 */

// Load .env.local before importing anything that reads env vars
import { config } from 'dotenv'
config({ path: '.env.local' })

import { embed } from '../lib/gemini'

async function main() {
  console.log('Testing embed()...')

  const texts = [
    'The capital of France is Paris.',
    'Machine learning is a subset of artificial intelligence.',
    'The quick brown fox jumps over the lazy dog.',
  ]

  const embeddings = await embed(texts, 'RETRIEVAL_DOCUMENT')

  console.log(`Got ${embeddings.length} embeddings`)
  embeddings.forEach((e, i) => {
    console.log(`  [${i}] dims=${e.length}  first5=[${e.slice(0, 5).map(n => n.toFixed(4)).join(', ')}]`)
  })

  // Sanity check: cosine similarity between identical texts should be 1.0
  const [a, b] = await embed(['hello world', 'hello world'], 'RETRIEVAL_QUERY')
  const sim = cosineSim(a, b)
  console.log(`\nSelf-similarity of "hello world": ${sim.toFixed(6)} (expect ≈ 1.0)`)

  if (Math.abs(sim - 1.0) > 0.01) {
    console.error('FAIL: self-similarity too far from 1.0')
    process.exit(1)
  }

  console.log('\n✓ Gemini embed() is working.')
}

function cosineSim(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0)
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0))
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0))
  return dot / (magA * magB)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
