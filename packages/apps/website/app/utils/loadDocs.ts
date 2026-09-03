import { docsItemByPath, docsVuePages, withoutTrailingSlash } from './docsNav'
import { renderMarkdown, type DocsHeading } from './renderMarkdown'

export type DocPage = {
  slug: string
  path: string
  title: string
  description: string
  html: string
  headings: DocsHeading[]
  searchText: string
  sourcePath: string
}

type Frontmatter = {
  title: string
  description: string
}

const rawDocs = import.meta.glob('../../content/docs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function parseFrontmatter(raw: string): { data: Frontmatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (match === null) {
    throw new Error('Docs page is missing YAML frontmatter')
  }
  const data: Frontmatter = { title: '', description: '' }
  for (const line of (match[1] ?? '').split('\n')) {
    const sep = line.indexOf(':')
    if (sep === -1) {
      continue
    }
    const key = line.slice(0, sep).trim()
    const value = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key === 'title' || key === 'description') {
      data[key] = value
    }
  }
  if (data.title === '' || data.description === '') {
    throw new Error('Docs page frontmatter needs title and description')
  }
  return { data, body: match[2] ?? '' }
}

function fileToSlug(filePath: string): { slug: string; relFile: string } {
  const match = /content\/docs\/(.+)\.md$/.exec(filePath)
  const relFile = match?.[1] ?? 'index'
  const slug = relFile === 'index' ? '' : relFile.replace(/\/index$/, '')
  return { slug, relFile }
}

function searchTextFrom(title: string, description: string, body: string, headings: DocsHeading[]): string {
  const headingText = headings.map((heading) => heading.text).join(' ')
  const stripped = body
    .replace(/^```[^\n]*\r?\n/gm, ' ')
    .replace(/```/g, ' ')
    .replace(/`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_-]/g, ' ')
  return `${title} ${description} ${headingText} ${stripped}`.toLowerCase()
}

function loadAllDocs(): Map<string, DocPage> {
  const pages = new Map<string, DocPage>()
  for (const [filePath, raw] of Object.entries(rawDocs)) {
    const { slug, relFile } = fileToSlug(filePath)
    const path = slug === '' ? '/docs' : `/docs/${slug}`
    const { data, body } = parseFrontmatter(raw)
    const { html, headings } = renderMarkdown(body)
    pages.set(path, {
      slug,
      path,
      title: data.title,
      description: data.description,
      html,
      headings,
      searchText: searchTextFrom(data.title, data.description, body, headings),
      sourcePath: `packages/apps/website/content/docs/${relFile}.md`,
    })
  }
  return pages
}

const docsByPath = loadAllDocs()

export function getDocPage(path: string): DocPage | undefined {
  return docsByPath.get(withoutTrailingSlash(path))
}

export function listDocPages(): DocPage[] {
  return [...docsByPath.values()]
}

export type DocsSearchHit = {
  path: string
  title: string
  description: string
  heading?: { id: string; text: string }
}

export function searchDocs(query: string): DocsSearchHit[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) {
    return []
  }
  const hits: DocsSearchHit[] = []
  for (const page of docsByPath.values()) {
    const pageMatch = terms.every((term) => page.searchText.includes(term))
    if (pageMatch) {
      hits.push({
        path: page.path,
        title: page.title,
        description: page.description,
      })
    }
    for (const heading of page.headings) {
      const headingBlob = `${page.title} ${heading.text}`.toLowerCase()
      if (terms.every((term) => headingBlob.includes(term))) {
        hits.push({
          path: `${page.path}#${heading.id}`,
          title: page.title,
          description: heading.text,
          heading,
        })
      }
    }
  }
  for (const page of docsVuePages) {
    const nav = docsItemByPath(page.path)
    const title = nav?.title ?? page.path
    const description = nav?.description ?? ''
    const blob =
      `${title} ${description} ${page.searchText} ${page.headings.map((heading) => heading.text).join(' ')}`.toLowerCase()
    if (terms.every((term) => blob.includes(term))) {
      hits.push({
        path: page.path,
        title,
        description,
      })
    }
    for (const heading of page.headings) {
      const headingBlob = `${title} ${heading.text}`.toLowerCase()
      if (terms.every((term) => headingBlob.includes(term))) {
        hits.push({
          path: `${page.path}#${heading.id}`,
          title,
          description: heading.text,
          heading,
        })
      }
    }
  }
  return hits.slice(0, 12)
}
