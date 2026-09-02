export type DocsNavItem = {
  title: string
  path: string
  description: string
}

export type DocsNavSection = {
  title: string
  items: DocsNavItem[]
}

export const docsNav: DocsNavSection[] = [
  {
    title: 'Start',
    items: [
      {
        title: 'Overview',
        path: '/docs/start/overview',
        description: 'What Lumpcode is, and how to read these docs.',
      },
      {
        title: 'First PR',
        path: '/docs/start/first-pr',
        description: 'Install the CLI and run one campaign by hand.',
      },
      {
        title: 'Worker',
        path: '/docs/start/worker',
        description: 'Leave a second clone running so branches keep arriving.',
      },
      {
        title: 'Core terms',
        path: '/docs/start/terms',
        description: 'Lump, context, marker commit, and the rest of the vocabulary.',
      },
      {
        title: 'How a run works',
        path: '/docs/start/run',
        description: 'One context, one branch, status from git, run versus worker.',
      },
    ],
  },
  {
    title: 'Author',
    items: [
      {
        title: 'Write a lump',
        path: '/docs/author/write-a-lump',
        description: 'The two required pieces, JSON versus TypeScript, and how to preview.',
      },
      {
        title: 'Contexts',
        path: '/docs/author/contexts',
        description: 'How Lumpcode finds units of work, and how to order them.',
      },
      {
        title: 'Prompts and steps',
        path: '/docs/author/prompts',
        description: 'Templates, multi-step runs, validation, and retry.',
      },
      {
        title: 'Agents',
        path: '/docs/author/agents',
        description: 'Cursor, Copilot, Claude Code, Codex, and OpenCode, and custom commands.',
      },
      {
        title: 'Recipes',
        path: '/docs/author/recipes',
        description: 'retryUntilGreen, backlogs, and other kit helpers.',
      },
    ],
  },
  {
    title: 'Config',
    items: [
      {
        title: 'Lump config',
        path: '/docs/config/lump',
        description: 'Fields on config.json, config.js, and config.ts.',
      },
      {
        title: 'Project config',
        path: '/docs/config/project',
        description: 'Committed .lumpcode/project.json defaults.',
      },
      {
        title: 'Local config',
        path: '/docs/config/local',
        description: 'Per-machine mode, workspace strategy, and primary branch.',
      },
      {
        title: 'Advanced',
        path: '/docs/config/advanced',
        description: 'Hooks, dynamic steps, and custom agent modules.',
      },
      {
        title: 'Types',
        path: '/docs/config/types',
        description: 'Hook signatures for config.ts: CommandFn, PromptFn, and the rest.',
      },
    ],
  },
  {
    title: 'Reference',
    items: [
      {
        title: 'Commands',
        path: '/docs/reference/commands',
        description: 'Every lumpcode subcommand, grouped by job.',
      },
      {
        title: 'Examples',
        path: '/docs/reference/examples',
        description: 'Copyable lump shapes for migrations, tickets, and sweeps.',
      },
      {
        title: 'Troubleshooting',
        path: '/docs/reference/troubleshooting',
        description: 'Status surprises, busy workspaces, and worker misses.',
      },
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
  { from: '/docs/lump-config', to: '/docs/config/lump' },
  { from: '/docs/project-config', to: '/docs/config/project' },
  { from: '/docs/local-config', to: '/docs/config/local' },
  { from: '/docs/advanced', to: '/docs/config/advanced' },
  { from: '/docs/types', to: '/docs/config/types' },
  { from: '/docs/commands', to: '/docs/reference/commands' },
  { from: '/docs/examples', to: '/docs/reference/examples' },
  { from: '/docs/troubleshooting', to: '/docs/reference/troubleshooting' },
]

export const docsRedirects = docsRedirectSources.flatMap((redirect) =>
  redirect.from.endsWith('/')
    ? [redirect]
    : [redirect, { from: `${redirect.from}/`, to: redirect.to }],
)

export function docsRedirectTarget(path: string): string | undefined {
  const from = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path
  return docsRedirectSources.find((redirect) => redirect.from === from)?.to
}

export function docsItemByPath(path: string): DocsNavItem | undefined {
  return docsPages.find((item) => item.path === path)
}

export function docsSectionTitle(path: string): string | undefined {
  return docsNav.find((section) => section.items.some((item) => item.path === path))?.title
}

export function docsKicker(path: string): string {
  const section = docsSectionTitle(path)
  return section === undefined ? 'Docs' : `Docs/${section}`
}

export function docsNeighbors(path: string): {
  previous: DocsNavItem | undefined
  next: DocsNavItem | undefined
} {
  const index = docsPages.findIndex((item) => item.path === path)
  if (index === -1) {
    return { previous: undefined, next: undefined }
  }
  return {
    previous: docsPages[index - 1],
    next: docsPages[index + 1],
  }
}

export function isDocsNavActive(itemPath: string, routePath: string): boolean {
  if (routePath === itemPath) {
    return true
  }
  if (!routePath.startsWith(`${itemPath}/`)) {
    return false
  }
  return !docsPages.some(
    (item) =>
      item.path !== itemPath &&
      item.path.startsWith(`${itemPath}/`) &&
      (routePath === item.path || routePath.startsWith(`${item.path}/`)),
  )
}

export const docsVuePages: {
  path: string
  sourcePath: string
  headings: { id: string; text: string; depth: 2 | 3 }[]
  searchText: string
}[] = [
  {
    path: '/docs/start/first-pr',
    sourcePath: 'packages/apps/website/app/pages/docs/start/first-pr.vue',
    headings: [
      { id: 'prerequisites', text: '1. Prerequisites', depth: 2 },
      { id: 'install-the-cli', text: '2. Install the CLI', depth: 2 },
      { id: 'optional-skill', text: '2b. Optional: install the skill', depth: 2 },
      { id: 'initialize', text: '3. Initialize a project and create a lump', depth: 2 },
      { id: 'point-at-work', text: '4. Point the lump at real work', depth: 2 },
      { id: 'run-once', text: '5. Preview, then run', depth: 2 },
      { id: 'meant-to-run', text: 'This is how Lumpcode is meant to run', depth: 2 },
    ],
    searchText:
      'first pr tutorial get started install cli project-setup lump-create myFirstLump lump-plan --contexts primaryBranch commit .lumpcode smoke test cursor copilot skill npm install-g worker git user.name user.email',
  },
  {
    path: '/docs/start/worker',
    sourcePath: 'packages/apps/website/app/pages/docs/start/worker.vue',
    headings: [
      { id: 'first-pr-already-done', text: '1. First PR already done', depth: 2 },
      { id: 'a-second-clone', text: '2. A second clone', depth: 2 },
      { id: 'start-it', text: '3. Start it', depth: 2 },
      { id: 'back-to-the-laptop', text: '4. Back to the laptop', depth: 2 },
    ],
    searchText:
      'worker dedicated clone lumpcode start daemon-status daemon-log stop local.json mode dedicated second clone leave a worker running git user.name user.email recipes cli-utils package.json npm install wipe',
  },
]
