import { Marked, Renderer, type Tokens } from 'marked'
import { highlightFence } from './highlightSnippet'

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

export function slugify(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
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

export function renderMarkdown(markdown: string): {
  html: string
  headings: DocsHeading[]
} {
  const headings: DocsHeading[] = []
  const seen = new Map<string, number>()
  const marked = new Marked()

  marked.use({
    gfm: true,
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const text = this.parser.parseInline(tokens)
        const id = uniqueSlug(slugify(stripHtml(text)) || 'section', seen)
        if (depth === 2 || depth === 3) {
          headings.push({ id, text: stripHtml(text), depth })
        }
        return `<h${depth} id="${id}"><a class="docs-heading-link" href="#${id}">${text}</a></h${depth}>\n`
      },
      code({ text, lang }: Tokens.Code) {
        const language = (lang ?? '').trim().split(/\s+/)[0] ?? ''
        const highlighted = highlightFence(text, language)
        const label = language === '' ? 'code' : language
        return `<div class="docs-code"><div class="docs-code-bar"><span>${escapeAttr(label)}</span></div><pre><code>${highlighted}</code></pre></div>\n`
      },
      codespan({ text }: Tokens.Codespan) {
        return `<code>${escapeAttr(text)}</code>`
      },
      link({ href, title, tokens }: Tokens.Link) {
        const text = this.parser.parseInline(tokens)
        const safeHref = href ?? ''
        const titleAttr = title ? ` title="${escapeAttr(title)}"` : ''
        const external = /^https?:\/\//.test(safeHref)
        const extra = external ? ' target="_blank" rel="noreferrer"' : ''
        return `<a href="${escapeAttr(safeHref)}"${titleAttr}${extra}>${text}</a>`
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
