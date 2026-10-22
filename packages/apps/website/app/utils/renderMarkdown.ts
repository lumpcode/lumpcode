import { Marked, Renderer, type Tokens } from 'marked'
import { highlightFence } from './highlightSnippet'
import { githubRepoUrl } from './site'

export type DocsHeading = {
  id: string
  text: string
  depth: 2 | 3
}

const ALERT_LABELS: Record<string, string> = {
  NOTE: 'Note',
  TIP: 'Tip',
  WARNING: 'Warning',
  IMPORTANT: 'Important',
}

const DOCS_ROOT_SEGMENTS = ['packages', 'apps', 'cli', 'DOCS']

/** Same anchors as GitHub, so `page.md#some-heading` works on both. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Docs markdown links to sibling pages GitHub-style (`../author/contexts.md#ordering`).
 * On the site those become `/docs/author/contexts#ordering`; anything else in the repo
 * becomes a GitHub URL.
 */
export function docsHref(href: string, relFile: string): string {
  if (href === '' || /^([a-z]+:|#|\/)/i.test(href)) {
    return href
  }
  const hashAt = href.indexOf('#')
  const pathPart = hashAt === -1 ? href : href.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : href.slice(hashAt)
  const segments = [...DOCS_ROOT_SEGMENTS, ...relFile.split('/').slice(0, -1)]
  for (const segment of pathPart.split('/')) {
    if (segment === '..') {
      segments.pop()
    } else if (segment !== '.' && segment !== '') {
      segments.push(segment)
    }
  }
  const insideDocs = DOCS_ROOT_SEGMENTS.every((segment, index) => segments[index] === segment)
  const docsRel = segments.slice(DOCS_ROOT_SEGMENTS.length)
  if (insideDocs && docsRel.length === 2 && docsRel[1]?.endsWith('.md')) {
    return `/docs/${docsRel[0]}/${docsRel[1].slice(0, -3)}${hash}`
  }
  return `${githubRepoUrl}/blob/main/${segments.join('/')}${hash}`
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function parseFenceInfo(info: string): { language: string; title: string } {
  const trimmed = info.trim()
  const language = trimmed.split(/\s+/)[0] ?? ''
  const rest = trimmed.slice(language.length).trim()
  const titled = /^title=(?:"([^"]+)"|'([^']+)'|(\S+))$/i.exec(rest)
  const bracketed = /^\[(.+)\]$/.exec(rest)
  const explicit =
    titled?.[1] ?? titled?.[2] ?? titled?.[3] ?? bracketed?.[1] ?? (rest === '' ? undefined : rest)
  const langKey = language.toLowerCase()
  const fallback =
    langKey === 'bash' ||
    langKey === 'sh' ||
    langKey === 'shell' ||
    langKey === 'zsh' ||
    langKey === 'terminal'
      ? 'terminal'
      : language === ''
        ? 'code'
        : language
  return { language, title: explicit ?? fallback }
}

function uniqueSlug(base: string, seen: Map<string, number>): string {
  const n = seen.get(base) ?? 0
  seen.set(base, n + 1)
  return n === 0 ? base : `${base}-${n + 1}`
}

function replaceGithubAlerts(
  markdown: string,
  parseInner: (markdown: string) => string,
): string {
  return markdown.replace(
    /^> \[!(NOTE|TIP|WARNING|IMPORTANT)\][ \t]*\r?\n((?:>.*(?:\r?\n|$))*)/gm,
    (_all, kind: string, body: string) => {
      const inner = body.replace(/^>[ \t]?/gm, '')
      const label = ALERT_LABELS[kind] ?? kind
      const cls = kind.toLowerCase()
      return `<div class="docs-callout docs-callout-${cls}"><p class="docs-callout-label">${label}</p>${parseInner(inner)}</div>\n\n`
    },
  )
}

function linkRenderers(relFile: string) {
  return {
    link(this: { parser: { parseInline: (tokens: Tokens.Generic[]) => string } }, { href, title, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens)
      const safeHref = docsHref(href ?? '', relFile)
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : ''
      const external = /^https?:\/\//.test(safeHref)
      const extra = external ? ' target="_blank" rel="noreferrer"' : ''
      return `<a href="${escapeAttr(safeHref)}"${titleAttr}${extra}>${text}</a>`
    },
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return text.replace(/href="([^"]*)"/g, (_all, href: string) => `href="${escapeAttr(docsHref(href, relFile))}"`)
    },
    codespan({ text }: Tokens.Codespan) {
      return `<code>${escapeAttr(text)}</code>`
    },
  }
}

export function renderInlineMarkdown(markdown: string, options: { relFile: string }): string {
  const marked = new Marked()
  marked.use({ gfm: true, renderer: linkRenderers(options.relFile) })
  return String(marked.parseInline(markdown))
}

export function renderMarkdown(markdown: string, options: { relFile: string }): {
  html: string
  headings: DocsHeading[]
} {
  const headings: DocsHeading[] = []
  const seen = new Map<string, number>()
  const marked = new Marked()

  marked.use({
    gfm: true,
    renderer: {
      ...linkRenderers(options.relFile),
      heading({ tokens, depth }: Tokens.Heading) {
        const text = this.parser.parseInline(tokens)
        const id = uniqueSlug(slugify(stripHtml(text)) || 'section', seen)
        if (depth === 2 || depth === 3) {
          headings.push({ id, text: stripHtml(text), depth })
        }
        return `<h${depth} id="${id}"><a class="docs-heading-link" href="#${id}">${text}</a></h${depth}>\n`
      },
      code({ text, lang }: Tokens.Code) {
        const { language, title } = parseFenceInfo(lang ?? '')
        const highlighted = highlightFence(text, language)
        return `<div class="code-window docs-code"><div class="code-window-bar docs-code-bar"><span>${escapeAttr(title)}</span></div><pre><code>${highlighted}</code></pre></div>\n`
      },
      table(token: Tokens.Table) {
        return `<div class="docs-table">${Renderer.prototype.table.call(this, token)}</div>`
      },
    },
  })

  const withAlerts = replaceGithubAlerts(markdown, (inner) => String(marked.parse(inner)))
  const html = String(marked.parse(withAlerts))
  return { html, headings }
}
