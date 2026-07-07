// pdf-parse 2.x ships as ESM without a proper default export declaration.
// Using require() avoids webpack's ESM default-import warning in Next.js.
// This is safe: Next.js API routes run in Node.js where require() is always available.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer, opts?: object) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }> = require('pdf-parse')

export interface ExtractResult {
  title: string
  text: string
}

// Extracts raw text from a PDF buffer.
// pdf-parse chosen over unpdf because it's synchronous, has no Wasm dependency,
// and works in Node.js without extra bundler config. Downside: no streaming.
export async function extractPdf(
  buffer: Buffer,
  filename?: string
): Promise<ExtractResult> {
  const data = await pdfParse(buffer)

  // pdf-parse puts the PDF's internal title in data.info.Title (if set).
  // Fall back to the filename (without extension) or a generic label.
  const title =
    (data.info?.Title as string | undefined)?.trim() ||
    filename?.replace(/\.pdf$/i, '') ||
    'Untitled PDF'

  return {
    title,
    text: data.text,
  }
}
