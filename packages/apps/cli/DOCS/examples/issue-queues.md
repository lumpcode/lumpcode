# Fix what a tool reports

Lumps whose work list comes from outside the repo: a code-quality server, an issue tracker, a monitoring tool. `getContextListFn` queries it on every pass, so new issues show up and fixed ones stop coming back.

## Static-analysis issues, grouped per file

Pull open issues from a code-quality server (SonarQube here), group them by file, and fix one file per context. Source files go before test files. Each fix must pass lint and typecheck before it is committed.

```ts .lumpcode/lumps/fixStaticAnalysis/config.ts
import { defineConfig } from '@lumpcode/cli-utils'
import { retryUntilGreen, shellCommand } from '@lumpcode/recipes'

const isTest = (file: string) => /\.(test|spec)\.[jt]sx?$/.test(file)

export default defineConfig({
  command: 'copilot',
  async getContextListFn() {
    const url = `${process.env.SONAR_URL}/api/issues/search?componentKeys=${process.env.SONAR_PROJECT}&resolved=false&ps=500`
    const auth = Buffer.from(`${process.env.SONAR_TOKEN}:`).toString('base64')
    const { issues } = await fetch(url, { headers: { Authorization: `Basic ${auth}` } }).then((r) => r.json())

    const byFile = new Map<string, string[]>()
    for (const issue of issues) {
      const file = issue.component.split(':').pop()
      byFile.set(file, [...(byFile.get(file) ?? []), `- line ${issue.line ?? '?'} (${issue.rule}): ${issue.message}`])
    }
    return [...byFile].map(([file, lines]) => ({
      name: file.replaceAll('/', '__').replaceAll('.', '_'),
      variables: { FILE: file, ISSUES: lines.join('\n') },
      options: { priority: isTest(file) ? 2 : 1 },
    }))
  },
  steps: retryUntilGreen({
    steps: [{
      promptTemplate:
        'Fix these static-analysis issues in @{FILE}:\n\n{ISSUES}\n\nKeep behavior identical and limit the change to each root cause.',
    }],
    validationCommandFn: () => shellCommand('npm run lint && npm run typecheck'),
    maxIterations: 4,
  }),
  numberOfContextsPerBranch: 5,
  maximumNumberOfConcurrentBranches: 2,
})
```

- Secrets come from the worker's environment. Keep them out of the repo; a gitignored `.env` that the config loads is fine.
- Five files per branch, two branches open at most: the worker produces about ten fixed files per review round, then waits for you.
- The issue text goes straight into the prompt as a variable, so the agent knows exactly what to fix and you can see it in `lump-plan --prompts`.

## Labelled bugs, verified in a browser

Your team adds an `agent` label to a bug; the next pass picks it up. The agent gets the bug text and its screenshots, a running copy of the app, and must leave a short report with proof before the branch is pushed.

```ts .lumpcode/lumps/fixLabelledBugs/config.ts
import { execFileSync } from 'node:child_process'
import { defineConfig } from '@lumpcode/cli-utils'
import { openPrPostTeardown, requireArtifactStep, retryUntilGreen, shellCommand } from '@lumpcode/recipes'
import { startDevServer, stopDevServer } from '../../helpers/devServer'

const appUrls = new Map<string, string>()

export default defineConfig({
  command: 'copilot',
  getContextListFn() {
    const issues = JSON.parse(execFileSync('gh', [
      'issue', 'list', '--label', 'agent', '--state', 'open', '--json', 'number,title,body',
    ], { encoding: 'utf8' }))
    return issues.map((issue) => ({
      name: `bug-${issue.number}`,
      variables: {
        TITLE: issue.title,
        BODY: issue.body,
        REPORT: `.lumpcode/lumps/fixLabelledBugs/reports/bug-${issue.number}.md`,
      },
    }))
  },
  async postSetupWorkspaceFn({ workspacePath, contextList }) {
    const url = await startDevServer(workspacePath)
    for (const context of contextList) appUrls.set(context.name, url)
  },
  steps: [
    ...retryUntilGreen({
      steps: [{
        promptFn: ({ context }) => `Fix this bug: ${context.variables.TITLE}

${context.variables.BODY}

The app is running at ${appUrls.get(context.name)}. Reproduce the bug in the browser before
changing code, make the smallest fix, then reload and verify. Do not commit.`,
      }],
      validationCommandFn: () => shellCommand('npm run lint && npm run typecheck'),
    }),
    ...retryUntilGreen({
      steps: [{ promptTemplate: 'Write @{REPORT}: root cause, the fix, and how you verified it in the browser, with screenshots.' }],
      validationCommandFn: requireArtifactStep('REPORT'),
      maxIterations: 3,
    }),
  ],
  postTeardownWorkspaceFn: async (input) => {
    await stopDevServer(input.workspacePath)
    return openPrPostTeardown({ provider: 'github' })(input)
  },
  keepHistory: true,
  maximumNumberOfConcurrentBranches: 3,
})
```

- **The label is the opt-in.** Humans decide which bugs the agent gets. Swap `gh issue list` for `az boards query --wiql …` (Azure DevOps) or your tracker's API; the shape is the same.
- **A running app.** `postSetupWorkspaceFn` runs once per branch workspace, before the agent. Start the dev server there, and stop it in `postTeardownWorkspaceFn`. Shared helpers live in `.lumpcode/helpers/`, outside `lumps/`. A sketch is in [Building blocks](building-blocks.md#start-a-dev-server-for-the-agent).
- **Proof, not promises.** The second loop fails the context until the report file exists, so every PR arrives with an explanation and screenshots for the reviewer.
- Give the agent a browser tool (for example a Playwright MCP server in its own config). Lumpcode only runs the agent; the tools are the agent's.
