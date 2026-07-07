export interface ExtractResult {
  title: string
  text: string
}

// Extracts clean text from a Markdown string.
// We keep the markdown syntax intact (headers, lists, etc.) because:
//   1. The LLM understands markdown structure.
//   2. Removing formatting risks destroying meaningful structure (e.g. tables).
//
// We DO strip YAML frontmatter (--- ... ---) because it's metadata, not content.
export function extractMarkdown(
  content: string,
  filename?: string
): ExtractResult {
  let text = content

  // Strip YAML frontmatter: starts with ---, ends with --- or ...
  const frontmatterMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?\n/)
  const frontmatter: Record<string, string> = {}
  if (frontmatterMatch) {
    text = text.slice(frontmatterMatch[0].length)
    // Parse simple key: value pairs for the title field
    for (const line of frontmatterMatch[1].split('\n')) {
      const [key, ...rest] = line.split(':')
      if (key && rest.length) {
        frontmatter[key.trim()] = rest.join(':').trim().replace(/^["']|["']$/g, '')
      }
    }
  }

  // Title priority: frontmatter.title → first # heading → filename
  const headingMatch = text.match(/^#\s+(.+)$/m)
  const title =
    frontmatter['title'] ||
    headingMatch?.[1]?.trim() ||
    filename?.replace(/\.mdx?$/i, '') ||
    'Untitled Document'

  return { title, text: text.trim() }
}
