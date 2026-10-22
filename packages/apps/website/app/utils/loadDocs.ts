import { docsSectionTitle, withoutTrailingSlash } from './docsNav'
import { buildSearchSections, markdownToPlainText, searchSections, type DocsSearchHit, type DocsSearchSection } from './docsSearch'
import { renderInlineMarkdown, renderMarkdown, type DocsHeading } from './renderMarkdown'

export type DocPage = {
  slug: string
  path: string
  title: string
  description: string
  descriptionHtml: string
  html: string
  headings: DocsHeading[]
  sourcePath: string
}

export const docsSourceDir = 'packages/apps/cli/DOCS'

// Pages live one folder deep (`start/`, `author/`, …). Top-level DOCS files are GitHub-only.
const rawDocs = import.meta.glob('../../../cli/DOCS/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function parsePage(raw: string, relFile: string): { title: string; description: string; body: string } {
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

function loadAllDocs(): { pages: Map<string, DocPage>; sections: DocsSearchSection[] } {
  const pages = new Map<string, DocPage>()
  const sections: DocsSearchSection[] = []
  for (const [filePath, raw] of Object.entries(rawDocs)) {
    const relFile = /DOCS\/(.+)\.md$/.exec(filePath)?.[1]
    if (relFile === undefined) {
      continue
    }
    const path = `/docs/${relFile}`
    const { title, description, body } = parsePage(raw, relFile)
    const { html, headings } = renderMarkdown(body, { relFile })
    const plainDescription = markdownToPlainText(description)
    pages.set(path, {
      slug: relFile,
      path,
      title,
      description: plainDescription,
      descriptionHtml: renderInlineMarkdown(description, { relFile }),
      html,
      headings,
      sourcePath: `${docsSourceDir}/${relFile}.md`,
    })
    sections.push(
      ...buildSearchSections({
        path,
        title,
        kicker: docsSectionTitle(path) ?? 'Docs',
        description: plainDescription,
        body,
        headings,
      }),
    )
  }
  return { pages, sections }
}

const { pages: docsByPath, sections: docsSections } = loadAllDocs()

export function getDocPage(path: string): DocPage | undefined {
  return docsByPath.get(withoutTrailingSlash(path))
}

export function listDocPages(): DocPage[] {
  return [...docsByPath.values()]
}

export function searchDocs(query: string): DocsSearchHit[] {
  return searchSections(docsSections, query)
}
