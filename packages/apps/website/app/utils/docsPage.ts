/** Splits a DOCS page into its `# Title`, the plain lead paragraph (the description), and the rest. */
export function parseDocPage(raw: string, relFile: string): { title: string; description: string; body: string } {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const titleIndex = lines.findIndex((line) => line.trim() !== '')
  const titleMatch = /^#\s+(.+)$/.exec(lines[titleIndex] ?? '')
  if (titleMatch === null) {
    throw new Error(`Docs page ${relFile} must start with a "# Title" line`)
  }
  let cursor = titleIndex + 1
  while (cursor < lines.length && lines[cursor]?.trim() === '') {
    cursor += 1
  }
  const descriptionLines: string[] = []
  while (cursor < lines.length && lines[cursor]?.trim() !== '') {
    descriptionLines.push(lines[cursor] ?? '')
    cursor += 1
  }
  const description = descriptionLines.join(' ').trim()
  if (description === '' || /^(#|>|\||```|<|- )/.test(description)) {
    throw new Error(`Docs page ${relFile} needs a plain lead paragraph after the title`)
  }
  return { title: (titleMatch[1] ?? '').trim(), description, body: lines.slice(cursor).join('\n') }
}
