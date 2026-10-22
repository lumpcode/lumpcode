import type { DocsHeading } from './renderMarkdown'

export type DocsSearchSection = {
  path: string
  pageTitle: string
  kicker: string
  heading?: string
  text: string
  lowerPageTitle: string
  lowerHeading: string
  lowerDescription: string
  lowerText: string
}

export type DocsSearchHit = {
  path: string
  kicker: string
  pageTitle: string
  heading?: string
  snippetHtml: string
}

const SYNONYMS: Record<string, string[]> = {
  worker: ['daemon', 'dedicated'],
  daemon: ['worker'],
  pr: ['pull request'],
  ticket: ['backlog', 'desc.yml'],
  tickets: ['backlog', 'desc.yml'],
  backlog: ['ticket'],
  schedule: ['cron'],
  cron: ['schedule'],
  retry: ['retryuntilgreen', 'validation'],
  validate: ['validation', 'lump-plan'],
  test: ['validation', 'npm test'],
  agent: ['command', 'preset'],
  install: ['setup'],
  logs: ['log', 'transcript'],
  log: ['transcript'],
  transcript: ['log'],
  watch: ['dashboard', 'transcript', 'daemon-status'],
  monitor: ['dashboard', 'transcript', 'daemon-status'],
  observe: ['dashboard', 'transcript'],
  status: ['lump-status', 'daemon-status'],
  done: ['finished'],
  skip: ['disabled'],
  pause: ['disabled'],
  parallel: ['maxparallelrun', 'worktree'],
}

const MAX_HITS = 15
const MAX_HITS_PER_PAGE = 3

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^```[^\n]*$/gm, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*|>]/g, ' ')
    .replace(/^#+\s+/gm, ' ')
    .replace(/^\s*[-:]+\s*$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Splits a page body on h2/h3 headings. `headings` must be the depth 2/3 headings
 * `renderMarkdown` produced for the same body, in document order, so ids line up.
 */
export function buildSearchSections(input: {
  path: string
  title: string
  kicker: string
  description: string
  body: string
  headings: DocsHeading[]
}): DocsSearchSection[] {
  const chunks: { heading?: DocsHeading; lines: string[] }[] = [{ lines: [] }]
  let inFence = false
  let headingIndex = 0
  for (const line of input.body.split(/\r?\n/)) {
    if (/^```/.test(line)) {
      inFence = !inFence
    }
    if (!inFence && /^#{2,3}\s+/.test(line)) {
      chunks.push({ heading: input.headings[headingIndex], lines: [] })
      headingIndex += 1
      continue
    }
    chunks.at(-1)?.lines.push(line)
  }
  const lowerPageTitle = input.title.toLowerCase()
  return chunks.map((chunk, index) => {
    const text = markdownToPlainText(chunk.lines.join('\n'))
    const heading = chunk.heading?.text
    return {
      path: chunk.heading === undefined ? input.path : `${input.path}#${chunk.heading.id}`,
      pageTitle: input.title,
      kicker: input.kicker,
      heading,
      text: index === 0 && text === '' ? input.description : text,
      lowerPageTitle,
      lowerHeading: (heading ?? '').toLowerCase(),
      lowerDescription: index === 0 ? input.description.toLowerCase() : '',
      lowerText: text.toLowerCase(),
    }
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function wordStartRegExp(term: string): RegExp {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}`, 'g')
}

function exactWordRegExp(term: string): RegExp {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}($|[^a-z0-9])`)
}

function fieldScore(field: string, term: string, weight: number): number {
  if (field === '' || !field.includes(term)) {
    return 0
  }
  if (exactWordRegExp(term).test(field)) {
    return weight
  }
  if (wordStartRegExp(term).test(field)) {
    return weight * 0.8
  }
  return weight * 0.3
}

function bodyScore(text: string, term: string): number {
  if (!text.includes(term)) {
    return 0
  }
  const count = text.match(wordStartRegExp(term))?.length ?? 0
  return count === 0 ? 0.5 : 1.5 + Math.min(count, 6) * 0.4
}

function termScore(section: DocsSearchSection, term: string): number {
  const isIntro = section.heading === undefined
  return Math.max(
    fieldScore(section.lowerPageTitle, term, isIntro ? 12 : 4),
    fieldScore(section.lowerHeading, term, 9),
    fieldScore(section.lowerDescription, term, 4),
    bodyScore(section.lowerText, term),
  )
}

function scoreSection(section: DocsSearchSection, terms: string[], phrase: string): {
  score: number
  matched: number
} {
  let score = 0
  let matched = 0
  for (const term of terms) {
    let best = termScore(section, term)
    for (const synonym of SYNONYMS[term] ?? []) {
      best = Math.max(best, termScore(section, synonym) * 0.5)
    }
    if (best > 0) {
      matched += 1
      score += best
    }
  }
  if (terms.length > 1 && matched > 0) {
    if (section.lowerHeading.includes(phrase) || section.lowerPageTitle.includes(phrase)) {
      score += 8
    } else if (section.lowerText.includes(phrase)) {
      score += 4
    }
  }
  return { score, matched }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function snippetHtml(text: string, terms: string[]): string {
  const lower = text.toLowerCase()
  let first = -1
  for (const term of terms) {
    const at = lower.indexOf(term)
    if (at !== -1 && (first === -1 || at < first)) {
      first = at
    }
  }
  const start = first <= 50 ? 0 : text.lastIndexOf(' ', first - 40) + 1
  const end = Math.min(text.length, start + 160)
  const slice = text.slice(start, end)
  const pattern = new RegExp(`(${terms.map(escapeRegExp).sort((a, b) => b.length - a.length).join('|')})`, 'gi')
  const marked = slice
    .split(pattern)
    .map((part, index) => (index % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
    .join('')
  return `${start > 0 ? '… ' : ''}${marked}${end < text.length ? ' …' : ''}`
}

export function searchSections(sections: DocsSearchSection[], query: string): DocsSearchHit[] {
  const phrase = query.toLowerCase().trim().replace(/\s+/g, ' ')
  const terms = [...new Set(phrase.split(' ').filter(Boolean))]
  if (terms.length === 0) {
    return []
  }
  const scored = sections
    .map((section) => ({ section, ...scoreSection(section, terms, phrase) }))
    .filter((entry) => entry.matched > 0)
  const complete = scored.filter((entry) => entry.matched === terms.length)
  const pool = complete.length > 0 ? complete : scored
  pool.sort((a, b) => b.score - a.score)
  const perPage = new Map<string, number>()
  const hits: DocsSearchHit[] = []
  for (const { section } of pool) {
    const page = section.path.split('#')[0] ?? section.path
    const count = perPage.get(page) ?? 0
    if (count >= MAX_HITS_PER_PAGE) {
      continue
    }
    perPage.set(page, count + 1)
    hits.push({
      path: section.path,
      kicker: section.kicker,
      pageTitle: section.pageTitle,
      heading: section.heading,
      snippetHtml: snippetHtml(section.text, terms),
    })
    if (hits.length >= MAX_HITS) {
      break
    }
  }
  return hits
}
