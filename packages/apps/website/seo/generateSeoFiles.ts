import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { docsNav } from '../app/utils/docsNav'
import { parseDocPage } from '../app/utils/docsPage'
import { markdownToPlainText } from '../app/utils/docsSearch'
import { docsHref } from '../app/utils/renderMarkdown'
import { cliInstall, githubRepoUrl, npmCliUrl, siteUrl } from '../app/utils/site'

// Build-time files for search engines and AI agents, all written to gitignored paths in `public/`:
// sitemap.xml (with lastmod from git), llms.txt, llms-full.txt, a raw markdown copy of every
// docs page at `/docs/<section>/<page>.md`, and `_headers` pointing each copy at its HTML page.

type AgentDoc = {
  section: string
  path: string
  title: string
  description: string
  markdown: string
  sourceFile: string
}

const llmsSummary =
  'Lumpcode is an open-source software factory that lives in your repo. A lump is one software factory as code: a folder in `.lumpcode/lumps/` that says what to work on, what to prompt, which agent to run, and how to check the result. Lumpcode runs your CLI coding agent through it inside your repo and pushes a branch for each piece of work, which you review as a pull request or let your CI merge. Git is the only state: no account, no database, no backend.'

const llmsFacts = [
  `Install with \`${cliInstall}\`, then run \`lumpcode setup\` in a git repo. Requires Node.js 22+, a git remote you can push to, and a CLI agent on PATH.`,
  'Works with Cursor, Claude Code, Copilot CLI, Codex, OpenCode, or a small custom command module for any other agent.',
  'Try one pass on your laptop with `lumpcode run`. Leave a worker running with `lumpcode start` on a second clone, or better, an always-on machine.',
  'A context is one unit of work (a file, a group of files, a ticket). One context per branch by default; several can share a branch.',
  'Lumpcode stops at `git push` and never merges. Open the pull request yourself, or opt in to `openPrPostTeardown` from `@lumpcode/recipes`.',
  'Progress is read from branches and marker commits on your git remote, so any clone resumes where another stopped.',
  `Apache-2.0. Source: ${githubRepoUrl}. Package: ${npmCliUrl}.`,
]

function markdownUrl(path: string): string {
  return `${siteUrl}${path}.md`
}

/** Rewrites GitHub-relative links to absolute URLs; docs pages point at their markdown copy. */
function absolutizeLinks(markdown: string, relFile: string): string {
  const rewrite = (href: string): string => {
    const resolved = docsHref(href, relFile)
    if (resolved.startsWith('/docs/')) {
      const hashAt = resolved.indexOf('#')
      const path = hashAt === -1 ? resolved : resolved.slice(0, hashAt)
      const hash = hashAt === -1 ? '' : resolved.slice(hashAt)
      return `${markdownUrl(path)}${hash}`
    }
    return resolved.startsWith('/') ? `${siteUrl}${resolved}` : resolved
  }
  return markdown
    .replace(/(\]\()([^)\s]+)(\))/g, (_, open: string, href: string, close: string) => `${open}${rewrite(href)}${close}`)
    .replace(/(href=")([^"]+)(")/g, (_, open: string, href: string, close: string) => `${open}${rewrite(href)}${close}`)
}

function readAgentDocs(repoRoot: string): AgentDoc[] {
  return docsNav.flatMap((section) =>
    section.items.map((item) => {
      const relFile = item.path.replace(/^\/docs\//, '')
      const sourceFile = join(repoRoot, 'packages/apps/cli/DOCS', `${relFile}.md`)
      const raw = readFileSync(sourceFile, 'utf8')
      const { title, description } = parseDocPage(raw, relFile)
      return {
        section: section.title,
        path: item.path,
        title,
        // Backticks become spaces in plain text; pull punctuation back against the word.
        description: markdownToPlainText(description).replace(/\s+([,.;:)])/g, '$1'),
        markdown: absolutizeLinks(raw.replace(/\r\n/g, '\n').trim(), relFile),
        sourceFile,
      }
    }),
  )
}

/** Last commit date (YYYY-MM-DD) touching any of the files, or undefined without git history. */
function lastModified(repoRoot: string, files: string[]): string | undefined {
  try {
    const date = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...files], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return date === '' ? undefined : date
  } catch {
    return undefined
  }
}

function sitemapXml({ repoRoot, websiteRoot, docs }: { repoRoot: string; websiteRoot: string; docs: AgentDoc[] }): string {
  const homeSources = ['app/pages/index.vue', 'app/utils/site.ts'].map((file) => join(websiteRoot, file))
  const entries = [
    { loc: siteUrl, lastmod: lastModified(repoRoot, homeSources) },
    ...docs.map((doc) => ({ loc: `${siteUrl}${doc.path}`, lastmod: lastModified(repoRoot, [doc.sourceFile]) })),
  ]
  const urls = entries.map(({ loc, lastmod }) =>
    lastmod === undefined ? `  <url><loc>${loc}</loc></url>` : `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`,
  )
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
}

function llmsHeader(): string {
  return `# Lumpcode\n\n> ${llmsSummary}\n\n${llmsFacts.map((fact) => `- ${fact}`).join('\n')}\n`
}

function llmsTxt(docs: AgentDoc[]): string {
  const sections = docsNav.map((section) => {
    const links = docs
      .filter((doc) => doc.section === section.title)
      .map((doc) => `- [${doc.title}](${markdownUrl(doc.path)}): ${doc.description}`)
    return `## ${section.title}\n\n${links.join('\n')}`
  })
  const optional = [
    `- [All docs in one file](${siteUrl}/llms-full.txt): every page above, concatenated in reading order`,
    `- [Source on GitHub](${githubRepoUrl}): code, README, and this repo's own lumps in \`.lumpcode/lumps/\``,
    `- [@lumpcode/cli on npm](${npmCliUrl}): the \`lumpcode\` command`,
    `- [Lump config JSON schema](${siteUrl}/schemas/lumpConfig.schema.json): every field of \`config.json\``,
  ]
  return `${llmsHeader()}\n${sections.join('\n\n')}\n\n## Optional\n\n${optional.join('\n')}\n`
}

function llmsFullTxt(docs: AgentDoc[]): string {
  const pages = docs.map((doc) => `Source: ${siteUrl}${doc.path}\n\n${doc.markdown}`)
  return `${llmsHeader()}\n---\n\n${pages.join('\n\n---\n\n')}\n`
}

// Cloudflare Pages `_headers`: each markdown copy declares its HTML page canonical, so search
// engines index the page and agents still get clean markdown.
function headersFile(docs: AgentDoc[]): string {
  const markdownRules = docs.map(
    (doc) =>
      `${doc.path}.md\n  Content-Type: text/markdown; charset=utf-8\n  Link: <${siteUrl}${doc.path}>; rel="canonical"`,
  )
  const textRules = ['/llms.txt', '/llms-full.txt'].map((path) => `${path}\n  Content-Type: text/plain; charset=utf-8`)
  return `${[...textRules, ...markdownRules].join('\n')}\n`
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

export function generateSeoFiles({ websiteRoot }: { websiteRoot: string }): void {
  const repoRoot = join(websiteRoot, '../../..')
  const publicDir = join(websiteRoot, 'public')
  const docs = readAgentDocs(repoRoot)

  rmSync(join(publicDir, 'docs'), { recursive: true, force: true })
  for (const doc of docs) {
    writeFile(join(publicDir, `${doc.path}.md`), `${doc.markdown}\n`)
  }
  writeFile(join(publicDir, 'sitemap.xml'), sitemapXml({ repoRoot, websiteRoot, docs }))
  writeFile(join(publicDir, 'llms.txt'), llmsTxt(docs))
  writeFile(join(publicDir, 'llms-full.txt'), llmsFullTxt(docs))
  writeFile(join(publicDir, '_headers'), headersFile(docs))
}
