// Recursive character splitter — the most common chunking strategy for RAG.
//
// How it works:
//   1. Try splitting on the first separator (e.g. "\n\n" = paragraph break).
//   2. If a piece is still too large, recurse with the next separator.
//   3. Merge adjacent small pieces back together (up to TARGET_CHARS).
//   4. Apply overlap: each chunk starts with the last OVERLAP_CHARS of the
//      previous chunk. This prevents context from being cut at chunk boundaries.
//
// Trade-off: semantic chunking (splitting at topic shifts via embeddings) would
// give more coherent chunks, but it requires one embedding per sentence — too
// expensive for free-tier use.

// ~500 tokens at roughly 4 chars/token (Gemini's tokenizer differs from GPT's;
// exact token counts don't matter here since we're under the embedding limit).
const TARGET_CHARS = 2000
const OVERLAP_CHARS = 200

const SEPARATORS = ['\n\n', '\n', '. ', ' ', '']

export interface Chunk {
  content: string
  chunkIndex: number
  tokenCount: number // approximate; good enough for storage/display
}

export function chunkText(text: string): Chunk[] {
  const cleaned = text.trim()
  if (!cleaned) return []

  const pieces = split(cleaned, SEPARATORS, TARGET_CHARS)

  // Add overlap from the tail of the previous chunk.
  // This means each chunk starts with a snippet of the prior one, so the model
  // has context about what came before even at a chunk boundary.
  return pieces.map((content, i) => {
    const overlap = i > 0 ? pieces[i - 1].slice(-OVERLAP_CHARS) : ''
    const withOverlap = overlap + content
    return {
      content: withOverlap,
      chunkIndex: i,
      tokenCount: Math.ceil(withOverlap.length / 4),
    }
  })
}

// Recursively split text using separators in priority order.
// Returns an array of strings each <= maxChars.
function split(text: string, separators: string[], maxChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const [sep, ...rest] = separators

  if (sep === undefined || sep === '') {
    // Last resort: hard character split
    const chunks: string[] = []
    for (let i = 0; i < text.length; i += maxChars) {
      chunks.push(text.slice(i, i + maxChars))
    }
    return chunks
  }

  // Split on this separator and recurse into any piece that's still too large
  const parts = text.split(sep).filter(p => p.trim().length > 0)
  const smallPieces: string[] = []

  for (const part of parts) {
    if (part.length <= maxChars) {
      smallPieces.push(part)
    } else {
      smallPieces.push(...split(part, rest, maxChars))
    }
  }

  // Greedily merge adjacent small pieces back up to TARGET_CHARS.
  // This avoids creating tiny chunks from sentences that were already short.
  const merged: string[] = []
  let current = ''

  for (const piece of smallPieces) {
    const candidate = current ? current + sep + piece : piece
    if (candidate.length <= maxChars) {
      current = candidate
    } else {
      if (current) merged.push(current)
      current = piece
    }
  }
  if (current) merged.push(current)

  return merged
}
