export const siteUrl = 'https://www.lumpcode.com'

export const githubRepoUrl = 'https://github.com/lumpcode/lumpcode'
export const npmCliUrl = 'https://www.npmjs.com/package/@lumpcode/cli'

const docsRoot =
  'https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS'

export const docs = {
  getStarted: `${docsRoot}/get-started.md`,
  concepts: `${docsRoot}/concepts.md`,
  commands: `${docsRoot}/commands.md`,
  lumpConfig: `${docsRoot}/lump-config.md`,
  localConfig: `${docsRoot}/local-config.md`,
  examples: `${docsRoot}/examples.md`,
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

export const exampleConfig = `{
  "contextListJson": {
    "COMPONENT": "src/components/{NAME}/index.tsx",
    "TEST": "src/components/{NAME}/index.test.tsx"
  },
  "prompt": {
    "promptTemplate": "Port @{COMPONENT} to Vue 3 and update @{TEST}.",
    "command": "cursor"
  }
}
`

export const exampleBranches = [
  { name: 'lump/portToVue/UserCard', state: 'merged', label: 'merged' },
  { name: 'lump/portToVue/DataTable', state: 'open', label: 'PR open' },
] as const

export const exampleBranchesFooter = '38 components still to go.'

export const positioningLine =
  'Your coding agent already handles one task: one branch, one pull request. Lumpcode runs the whole list.'

export const useWhen = [
  'The same refactoring logic across hundreds of files',
  'An ordered ticket backlog, one PR each',
  'Docs, tests, hardening or cleanup that runs for weeks',
] as const

export const useWhenMore =
  'And many more: retry until your test command passes, a Jira board as the context list, one lump waiting on another to merge...'

export const lumpsTree = `.lumpcode/lumps/
├── normalizeUtils/     one PR per file
├── ticketBacklog/      one PR per ticket
├── docsSweep/          one PR per stale page
└── deadCode/           one PR per unused export
`

export const features = [
  {
    title: 'Any loop you can describe',
    body: 'File sweeps, ticket queues, doc passes, cleanup. Each item can run several prompts in order, gated on your build or tests and retried with the failure output.',
  },
  {
    title: 'Close the laptop; your remote still knows what is left',
    body: 'There is no database. What is finished and what remains are read from the branches and commits already on your git remote.',
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
  'Copies the repo instead of editing your checkout',
  'Runs one agent at a time by default',
] as const

export const steps = [
  {
    title: 'Write the lump',
    body: 'One config file says what to work on, what to prompt, and which agent to use. Every item it matches becomes one context.',
  },
  {
    title: 'Run it',
    body: 'Lumpcode takes the next unfinished context, runs your agent on it, then commits the result and pushes a branch. One context per branch by default; group several when the diffs are small.',
  },
  {
    title: 'Review, adjust, then merge',
    body: 'Open that branch as a pull request. Push fixes to it if the agent got something wrong, and merge when it looks right. The next run skips what you merged and picks up the next context.',
  },
] as const

export const rangeLead =
  'A list, a prompt, an agent. Start with a JSON file. The same CLI runs TypeScript configs, multi-step pipelines, and validation that retries until it passes.'

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
    title: 'Validation and retry',
    body: 'Gate each run on your build or test command and feed the failure output back to the agent, instead of finding out at review time.',
  },
  {
    title: 'Unattended',
    body: 'Point a separate clone at the same lump and leave it running. It keeps pushing reviewable branches while you do something else.',
  },
] as const

export const workerTitle = 'Then stop running it yourself.'

export const workerLine =
  'A one-off run is how you try it. A worker is how you use it.'

export const workerLead =
  'A second clone you never edit, even another folder on this laptop, and one command: lumpcode start. It picks up every lump in the repo and pushes branches while you do something else. This is how Lumpcode is meant to run.'

export const workerSteps = [
  {
    title: 'Start it once',
    body: 'On a clone you never develop in, run lumpcode start. It discovers every lump in the repo and works through them on a schedule.',
  },
  {
    title: 'Push a new lump',
    body: 'Nothing to deploy, register, or restart. The worker fetches your primary branch on its next pass and finds the new lump on its own.',
  },
  {
    title: 'Branches arrive',
    body: 'It works through each lump context by context and pushes a branch per run. You open the pull requests and merge from wherever you are.',
  },
] as const

export const workerBranches = [
  { name: 'lump/ticketBacklog/LUMP-214', state: 'open', label: 'pushed' },
  { name: 'lump/docsSweep/cli-commands', state: 'open', label: 'pushed' },
  { name: 'lump/normalizeUtils/slugify', state: 'running', label: 'running' },
] as const

export const workerBranchesFooter = 'Pushed overnight, from three different lumps.'

export const agents = [
  'Cursor',
  'Copilot CLI',
  'Claude Code',
  'Codex',
  'OpenCode',
] as const
