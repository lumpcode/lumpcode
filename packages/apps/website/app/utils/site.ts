export const siteUrl = 'https://lumpcode.com'

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

export const installCliLabel = 'The CLI. This is Lumpcode.'
export const installSkillLabel =
  'Optional skill. Gives your coding agent current docs.'

export const exampleConfig = `import { defineConfig } from '@lumpcode/cli-utils'

export default defineConfig({
  command: 'cursor',
  contextListJson: {
    FILE: 'src/utils/{NAME}.ts',
  },
  maximumNumberOfConcurrentBranches: 3,
  prompt: 'Normalize {FILE} and add tests. Keep the suite green.',
})
`

export const exampleCaption =
  'This lump: one PR per file matching src/utils/*.ts, at most three open at a time.'

export const useWhen = [
  'Similar edits (migrations, tests, docs)',
  'A ticket queue',
  'A multi-week refactor',
] as const

export const features = [
  {
    title: 'Each slice is a PR you review',
    body: 'Work arrives as reviewable PRs. The campaign itself is in the repo, so a change to the loop is a normal diff.',
  },
  {
    title: 'Close the laptop; origin still knows what is left',
    body: 'Done and left are read from origin, not a database. The next tick picks up from the remote.',
  },
  {
    title: 'Use the agent you already have',
    body: 'Cursor, Copilot CLI, Claude Code, Codex, OpenCode, or a module you write. Lumpcode drives it. You review.',
  },
] as const

export const steps = [
  {
    title: 'Write the lump',
    body: 'What to find, what to prompt, which agent. A context is one slice, often one file or one ticket.',
  },
  {
    title: 'Run a tick, or leave a daemon',
    body: 'Lumpcode takes the next unfinished context, runs the agent, commits, and pushes a branch.',
  },
  {
    title: 'Merge the PR',
    body: 'One context, one branch. Merge what is good.',
  },
  {
    title: 'It continues',
    body: 'Finished work is skipped. Push a new lump or a prompt change; the next tick uses it. Nothing to deploy.',
  },
] as const

export const campaignCase = {
  title: 'Hundreds of utils, one PR each.',
  body: 'A prompt does the edit; a command retries typecheck and tests. Cap how many branches are open. Stop for a week; the next tick reads origin and continues.',
  outcome:
    "This repo's abstraction lumps have landed 17 utils that way, one PR at a time.",
} as const

export const agents = [
  'Cursor',
  'Copilot CLI',
  'Claude Code',
  'Codex',
  'OpenCode',
] as const
