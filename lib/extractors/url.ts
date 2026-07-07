import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

export interface ExtractResult {
  title: string
  text: string
}

// Extracts the main article text from a URL using Mozilla Readability.
// Readability is the same algorithm Firefox's Reader Mode uses — it strips
// navbars, ads, and boilerplate, keeping just the article body.
//
// Alternative: cheerio + manual selector. Readability is better for
// arbitrary URLs where you don't know the site structure in advance.
export async function extractUrl(url: string): Promise<ExtractResult> {
  const response = await fetch(url, {
    headers: {
      // Many sites block bots; a browser UA reduces false 403s
      'User-Agent':
        'Mozilla/5.0 (compatible; PersonalRAG/1.0; +https://github.com/personal-rag)',
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()

  // JSDOM parses the HTML into a DOM so Readability can walk it
  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()

  if (!article) {
    throw new Error(`Readability could not extract content from ${url}`)
  }

  // article.textContent has the plain text; article.content is HTML
  return {
    title: article.title || new URL(url).hostname,
    text: (article.textContent ?? '').trim(),
  }
}
