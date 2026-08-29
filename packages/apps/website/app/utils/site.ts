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
    title: 'Review, adjust, then merge',
    body: 'Open the PR. Review it, and change the branch if you need to. Merge when it is good.',
  },
  {
    title: 'It continues',
    body: 'Finished work is skipped. Push a new lump or a prompt change; the next tick uses it. Nothing to deploy.',
  },
] as const

export const rangeLead =
  'You can start with a JSON prompt. The same CLI runs TypeScript, validation, and multi-lump pipelines when you need them.'

export const rangeCases = [
  {
    title: 'Start with a JSON file.',
    body: 'A file pattern and a prompt. lump-create writes it. You run once and open the PR.',
    href: '/get-started',
    linkLabel: 'The tutorial is this.',
  },
  {
    title: 'Grow the loop when the work needs it.',
    body: "TypeScript, validation, retries, hooks, two lumps in a pipeline. This repo's abstraction lumps find a duplicated util and implement it. 17 have landed that way, one PR at a time.",
  },
] as const

export const agents = [
  'Cursor',
  'Copilot CLI',
  'Claude Code',
  'Codex',
  'OpenCode',
] as const
