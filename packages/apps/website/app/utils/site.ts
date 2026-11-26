export const siteUrl = 'https://www.lumpcode.com'

export const siteTitle = 'Lumpcode — The simplest software factory lives in your repo'

export const siteDescription =
  'Open-source micro software factories as code: lumps you commit to your repo, run by your coding agent, one branch per piece of work, with git as the only state.'

export const githubRepoUrl = 'https://github.com/lumpcode/lumpcode'
export const repoLumpsUrl = `${githubRepoUrl}/tree/dev/.lumpcode/lumps`
export const npmCliUrl = 'https://www.npmjs.com/package/@lumpcode/cli'

export const docs = {
  overview: '/docs/start/overview',
  getStarted: '/docs/start/first-pr',
  firstPr: '/docs/start/first-pr',
  worker: '/docs/start/worker',
  concepts: '/docs/start/run',
  commands: '/docs/reference/commands',
  lumpConfig: '/docs/config/lump',
  types: '/docs/config/types',
  localConfig: '/docs/config/local',
  daemons: '/docs/config/daemons',
  examples: '/docs/examples/overview',
  observe: '/docs/start/observe',
  backlog: '/docs/author/backlog',
  customAgent: '/docs/author/agents#custom-command-module',
} as const

export const skillInstall = 'npx skills add lumpcode/skills'
export const cliInstall = 'npm install -g @lumpcode/cli'

export const installCliLabel = 'The CLI. This is all you need to run a lump.'
export const installSkillLabel =
  'Optional. Helps the agent in your editor write and update lumps. Not used when a lump runs.'

export const codebaseTree = `src/components/
├── UserCard/    index.tsx  index.test.tsx
└── DataTable/   index.tsx  index.test.tsx
`

export const exampleConfig = `export default defineConfig({
  command: 'claude-code',
  contextListJson: {
    COMPONENT: 'src/components/{NAME}/index.tsx',
    TEST: 'src/components/{NAME}/index.test.tsx',
  },
  steps: retryUntilGreen({
    steps: [{
      promptTemplate: 'Port @{COMPONENT} to Vue 3 and update @{TEST}.',
    }],
    validationCommandFn: () => shellCommand('npm run test'),
  }),
})
`

export const exampleBranches = [
  { name: 'lump/portToVue/UserCard', state: 'merged', label: 'merged' },
  { name: 'lump/portToVue/DataTable', state: 'open', label: 'PR open' },
] as const

export const exampleBranchesFooter = '38 components still to go.'

export const positioningLine =
  'Your coding agent already handles one task: one branch, one pull request. A software factory runs the whole list, and keeps running.'

export const sdlcLine =
  'Start small, grow big. Two commands, lumpcode setup and lumpcode run, take an existing repo to a first lump, and it stays the same tool when one lump becomes a dozen that feed each other.'

export const factoryKindsTitle = 'A fleet of micro software factories.'

export const factoryKindsLead =
  'A lump is just code, so it can be whatever factory your flow needs. Lumpcode only fixes the shape: a list of work, the prompts, the agent, one branch per piece of work, state in git. Start with one, grow a fleet.'

export const factoryKindsLabel = 'For example'

export const factoryKinds = [
  {
    title: 'A one-time migration',
    body: 'Port every component, apply a codemod, rename an API. The list shrinks as branches merge, and the lump is done when it is empty.',
  },
  {
    title: 'Background hygiene',
    body: 'Tests where they are missing, docs that drifted, what your linter or static analysis reports. A few branches at a time, for months.',
  },
  {
    title: 'Tickets from your tracker',
    body: 'Markdown ticket folders in your repo, or a query on Jira or Azure DevOps. One branch per ticket, in the order you set.',
  },
  {
    title: 'Labelled bugs',
    body: 'GitHub issues your team labels for the agent, one fix per branch.',
  },
  {
    title: 'Factories that feed each other',
    body: 'One lump hunts bugs and files them as tickets; another fixes them once that pull request is merged.',
  },
] as const

export const factoryKindsOwn = {
  title: 'Your own flow',
  body: 'Anything your code can list becomes the work. Configs can be TypeScript, so the factory is whatever you write.',
} as const

export const fleetTitle = 'Lumpcode is built by its own fleet.'

export const fleetBody =
  'Close to half of the pull requests merged into Lumpcode came from lump branches. One lump hunts bugs and another fixes them; one turns loose ideas into tickets for four backlogs, and each of those backlogs is a single recipe call. Small ones polish, trim, and rewrite, one change per branch.'

export const lumpsTree = `.lumpcode/lumps/
├── bugHunter/      files bugs as tickets
├── bugfixes/       fixes them, one branch each
├── autoTriage/     turns ideas into tickets
├── backlog/        features
├── qol/            quality of life
├── docs/           docs and website
├── polisher/       one small polish per branch
├── trimmer/        removes one unused piece
└── writer/         one wording fix per branch
`

export const asCodeTitle = 'Factories as code.'

export const asCodeLead =
  'A lump is a folder of config and prompts, committed and reviewed like the rest of your code. Changing a factory is a pull request; Lumpcode stores nothing of its own.'

export const features = [
  {
    title: 'Your repo is the context',
    body: 'From the first run, the agent sees what your editor\'s agent sees: your skills, AGENTS.md, docs, and conventions. Nothing to upload or index.',
  },
  {
    title: 'Git is the only state',
    body: 'No database. What is finished and what remains are read from the branches on your git remote, so any clone picks up where another stopped.',
  },
  {
    title: 'Plug-and-run recipes',
    body: 'Run `npm i @lumpcode/recipes` in your repo. A recipe is a whole factory in one function call: `featureBacklog({…})` turns ticket folders into requirements, tests, code, and checks. Its kit has smaller pieces, like retry until green.',
  },
  {
    title: 'Use the agent you already have',
    body: 'Cursor, Copilot CLI, Claude Code, Codex, and OpenCode work as they are, or you can write a small module for anything else.',
  },
] as const

export const safetyLabel = 'Safe by default'

export const trustPoints = [
  'Works only on its own lump/… branches',
  'Never merges anything itself',
  'A worker clone you never develop in',
  'Runs one agent at a time by default',
] as const

export const steps = [
  {
    title: 'Write the lump',
    body: 'One config file says what to work on, what to prompt, and which agent to use. Every item it matches becomes one context.',
  },
  {
    title: 'Start a worker',
    body: 'On a clone you never edit, lumpcode start runs your agent on the next unfinished context and pushes a branch, then moves on: one context per branch by default, several when the diffs are small. Try one pass by hand first with lumpcode run.',
  },
  {
    title: 'Review, adjust, then merge',
    body: 'Review each branch as a pull request: open it yourself, or have it opened automatically after the push. Push fixes if the agent got something wrong, and merge when it looks right. The next run skips what you merged.',
  },
] as const

// Visuals under the three "What you do." steps. The terminal is an illustration, not literal CLI output.
export const stepConfigFile = 'lumps/addTests/config.ts'

export const stepConfig = `export default defineConfig({
  command: 'claude-code',
  contextListJson: {
    FILE: 'src/utils/{NAME}.ts',
  },
  steps: retryUntilGreen({
    steps: [{
      promptTemplate: 'Add tests for @{FILE}.',
    }],
    validationCommandFn: () =>
      shellCommand('npm test'),
    maxIterations: 3,
  }),
})
`

export const stepTerminal = [
  { tag: '$', text: 'lumpcode start', tone: 'cmd' },
  { tag: 'worker', text: 'up, every 5 min', tone: 'muted' },
  { tag: '$', text: 'lumpcode transcript --lumpName addTests', tone: 'cmd' },
  { tag: 'context', text: 'formatDate', tone: 'muted' },
  { tag: 'check', text: 'npm test  ✗ attempt 1/3', tone: 'bad' },
  { tag: 'agent', text: 'fixing with the failure', tone: 'muted' },
  { tag: 'check', text: 'npm test  ✓', tone: 'good' },
  { tag: 'push', text: 'lump/addTests/formatDate', tone: 'accent' },
  { tag: 'context', text: 'parseQuery', tone: 'muted' },
] as const

export const stepPullRequest = {
  title: 'Add tests for formatDate',
  branch: 'lump/addTests/formatDate',
  stats: '+48 −2',
  events: [
    { kind: 'open', text: 'Opened automatically after the push' },
    { kind: 'check', text: 'npm test passed' },
    { kind: 'comment', text: 'You: Cover the UTC midnight case too.' },
    { kind: 'commit', text: 'You pushed: test: cover UTC midnight' },
  ],
  footer: 'Next run skips formatDate.',
} as const

export const objectionTitle = 'You could script this. Or not.'

export const objectionLead =
  'A for-loop over your files and a call to your agent gets you surprisingly far. Here is what you end up rebuilding.'

export const objectionCases = [
  {
    title: 'Resuming',
    body: 'A loop is easy to write. A resumable one is not. Lumpcode reads your git remote and continues where the last run stopped.',
  },
  {
    title: 'Blast radius',
    body: 'A bad result is one pull request you adjust or close, not a 200-file diff to untangle. If the prompt needs tweaking, the first PR shows it.',
  },
  {
    title: 'Clean workspaces',
    body: 'On a worker, each run gets its own checkout or git worktree, set up and torn down under a git lock, so lumps running side by side never collide.',
  },
  {
    title: 'Nothing left running',
    body: 'Every step runs in its own process group and is cleaned up when it ends. If a worker crashes, it is restarted and whatever it left behind is stopped.',
  },
] as const

export const workerTitle = 'Built to run without you.'

export const workerLine =
  'A one-off run is how you try it. A worker is how you use it.'

export const workerLead =
  'Start with a second clone you never edit, even another folder on this laptop. The best setup is an always-on machine, a small server or VM with git access and your agent CLI, running lumpcode start. Push a new lump and the worker finds it on its next pass: nothing to deploy, register, or restart.'


export const workerBranches = [
  { name: 'lump/bugfixes/missing-base-branch', state: 'open', label: 'pushed' },
  { name: 'lump/polisher/2026-11-16', state: 'open', label: 'pushed' },
  { name: 'lump/backlog/daemon-config-files', state: 'running', label: 'running' },
] as const

export const workerBranchesFooter = 'Overnight, from three different lumps.'

export const agents = [
  'Cursor',
  'Copilot CLI',
  'Claude Code',
  'Codex',
  'OpenCode',
] as const

export const themeStorageKey = 'lumpcode-theme'

/** Address-bar color. Light is the first-visit paint; dark matches the no-JS tokens. */
export const themeColorLight = '#f3f8f8'
export const themeColorDark = '#000514'

/** Runs in <head> before paint. A stored lumpcode-theme value wins; otherwise light. Syncs theme-color. */
export const themeBootScript = `(function(){var d=document.documentElement;d.classList.add('js');var t=null;try{t=localStorage.getItem('${themeStorageKey}')}catch(e){}var v=t==='light'||t==='dark'?t:'light';d.dataset.theme=v;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',v==='light'?'${themeColorLight}':'${themeColorDark}')})();`
