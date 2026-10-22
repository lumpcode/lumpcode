export type DocsNavItem = {
  title: string
  path: string
}

export type DocsNavSection = {
  title: string
  items: DocsNavItem[]
}

// Each item is a markdown file at packages/apps/cli/DOCS/<section>/<page>.md.
export const docsNav: DocsNavSection[] = [
  {
    title: 'Start',
    items: [
      { title: 'Overview', path: '/docs/start/overview' },
      { title: 'First PR', path: '/docs/start/first-pr' },
      { title: 'Worker', path: '/docs/start/worker' },
      { title: 'Watch it work', path: '/docs/start/observe' },
      { title: 'Core terms', path: '/docs/start/terms' },
      { title: 'How a run works', path: '/docs/start/run' },
    ],
  },
  {
    title: 'Examples',
    items: [
      { title: 'Pick an example', path: '/docs/examples/overview' },
      { title: 'Migrations and sweeps', path: '/docs/examples/sweeps' },
      { title: 'Fix what a tool reports', path: '/docs/examples/issue-queues' },
      { title: 'Ticket backlogs', path: '/docs/examples/backlogs' },
      { title: 'Lumps that feed lumps', path: '/docs/examples/pipelines' },
      { title: 'Building blocks', path: '/docs/examples/building-blocks' },
    ],
  },
  {
    title: 'Author',
    items: [
      { title: 'Write a lump', path: '/docs/author/write-a-lump' },
      { title: 'Contexts', path: '/docs/author/contexts' },
      { title: 'Prompts and steps', path: '/docs/author/prompts' },
      { title: 'Agents', path: '/docs/author/agents' },
      { title: 'Recipes', path: '/docs/author/recipes' },
      { title: 'Folder backlog', path: '/docs/author/backlog' },
    ],
  },
  {
    title: 'Config',
    items: [
      { title: 'Lump config', path: '/docs/config/lump' },
      { title: 'Project config', path: '/docs/config/project' },
      { title: 'Local config', path: '/docs/config/local' },
      { title: 'Daemon files', path: '/docs/config/daemons' },
      { title: 'Advanced', path: '/docs/config/advanced' },
      { title: 'Types', path: '/docs/config/types' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { title: 'Commands', path: '/docs/reference/commands' },
      { title: 'Troubleshooting', path: '/docs/reference/troubleshooting' },
    ],
  },
]

export const docsPages = docsNav.flatMap((section) => section.items)

export const docsPrerenderRoutes = docsPages.map((item) => item.path)

const docsRedirectSources: { from: string; to: string }[] = [
  { from: '/docs', to: '/docs/start/overview' },
  { from: '/get-started', to: '/docs/start/first-pr' },
  { from: '/get-started/worker', to: '/docs/start/worker' },
  { from: '/docs/get-started', to: '/docs/start/first-pr' },
  { from: '/docs/get-started/first-pr', to: '/docs/start/first-pr' },
  { from: '/docs/get-started/worker', to: '/docs/start/worker' },
  { from: '/docs/start', to: '/docs/start/overview' },
  { from: '/docs/terms', to: '/docs/start/terms' },
  { from: '/docs/how-a-run-works', to: '/docs/start/run' },
  { from: '/docs/start/how-a-run-works', to: '/docs/start/run' },
  { from: '/docs/write-a-lump', to: '/docs/author/write-a-lump' },
  { from: '/docs/contexts', to: '/docs/author/contexts' },
  { from: '/docs/prompts', to: '/docs/author/prompts' },
  { from: '/docs/agents', to: '/docs/author/agents' },
  { from: '/docs/recipes', to: '/docs/author/recipes' },
  { from: '/docs/backlog', to: '/docs/author/backlog' },
  { from: '/docs/lump-config', to: '/docs/config/lump' },
  { from: '/docs/project-config', to: '/docs/config/project' },
  { from: '/docs/local-config', to: '/docs/config/local' },
  { from: '/docs/advanced', to: '/docs/config/advanced' },
  { from: '/docs/types', to: '/docs/config/types' },
  { from: '/docs/commands', to: '/docs/reference/commands' },
  { from: '/docs/examples', to: '/docs/examples/overview' },
  { from: '/docs/reference/examples', to: '/docs/examples/overview' },
  { from: '/docs/troubleshooting', to: '/docs/reference/troubleshooting' },
]

export const docsRedirects = docsRedirectSources.flatMap((redirect) =>
  redirect.from.endsWith('/')
    ? [redirect]
    : [redirect, { from: `${redirect.from}/`, to: redirect.to }],
)

export function withoutTrailingSlash(path: string): string {
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1)
  }
  return path
}

export function docsRedirectTarget(path: string): string | undefined {
  const from = withoutTrailingSlash(path)
  return docsRedirectSources.find((redirect) => redirect.from === from)?.to
}

export function docsItemByPath(path: string): DocsNavItem | undefined {
  const normalized = withoutTrailingSlash(path)
  return docsPages.find((item) => item.path === normalized)
}

export function docsSectionTitle(path: string): string | undefined {
  const normalized = withoutTrailingSlash(path)
  return docsNav.find((section) => section.items.some((item) => item.path === normalized))?.title
}

export function docsKicker(path: string): string {
  const section = docsSectionTitle(path)
  return section === undefined ? 'Docs' : `Docs/${section}`
}

export function docsNeighbors(path: string): {
  previous: DocsNavItem | undefined
  next: DocsNavItem | undefined
} {
  const index = docsPages.findIndex((item) => item.path === withoutTrailingSlash(path))
  if (index === -1) {
    return { previous: undefined, next: undefined }
  }
  return {
    previous: docsPages[index - 1],
    next: docsPages[index + 1],
  }
}

export function isDocsNavActive(itemPath: string, routePath: string): boolean {
  const path = withoutTrailingSlash(routePath)
  if (path === itemPath) {
    return true
  }
  if (!path.startsWith(`${itemPath}/`)) {
    return false
  }
  return !docsPages.some(
    (item) =>
      item.path !== itemPath &&
      item.path.startsWith(`${itemPath}/`) &&
      (path === item.path || path.startsWith(`${item.path}/`)),
  )
}
