# Building blocks

Small patterns that the bigger examples combine. Each one drops into any lump.

## Smoke test

One context, a prompt that edits nothing. Use it to check the agent, your git remote, and marker commits before a real campaign.

```json .lumpcode/lumps/smokeTest/config.json
{
  "contextListJson": [{ "name": "README", "variables": { "FILE": "README.md" } }],
  "prompt": {
    "promptTemplate": "Reply with one line: smoke OK for @{FILE}. Do not edit any file.",
    "command": "cursor"
  }
}
```

```bash
lumpcode run smokeTest
lumpcode lump-status --lumpName smokeTest
```

## Retry until green

Run your checks after the agent, and give it the output when they fail. A branch is only pushed when the checks pass; after the last attempt the context fails and stays `toDo`.

```ts config.ts
import { defineConfig } from '@lumpcode/cli-utils'
import { retryUntilGreen, shellCommand } from '@lumpcode/recipes'

export default defineConfig({
  command: 'cursor',
  contextListJson: { FILE: 'src/utils/{NAME}.ts' },
  postSetupWorkspaceCommand: 'npm ci',
  steps: retryUntilGreen({
    steps: [{ promptTemplate: 'Add an explicit return type to every export in @{FILE}.' }],
    validationCommandFn: () => shellCommand('npm run typecheck && npm test'),
    maxIterations: 4,
  }),
})
```

`postSetupWorkspaceCommand` installs dependencies once per branch workspace, before the agent runs. Lint the one file, typecheck one package, or run one test folder when the full suite is slow: `validationCommandFn` gets the context, so `({ context }) => shellCommand(\`npx eslint ${context.variables.FILE}\`)` works.

### Retry until green, by hand

The same loop without the recipe, when you need your own retry prompt or counter. A step with `commandFn` and no prompt runs a program; its `postCommandExecFn` can return the next steps.

```ts config.ts
import { defineConfig } from '@lumpcode/cli-utils'

const MAX_ATTEMPTS = 4

function check(attempt: number) {
  return {
    commandFn: () => ({ executable: 'npm', args: ['test'] }),
    continueOnError: attempt < MAX_ATTEMPTS,
    postCommandExecFn({ commandSucceeded, commandResult }) {
      if (commandSucceeded || attempt >= MAX_ATTEMPTS) return
      return [
        { promptFn: () => `The tests still fail. Fix them.\n\n${commandResult}` },
        check(attempt + 1),
      ]
    },
  }
}

export default defineConfig({
  command: 'cursor',
  contextListJson: { FILE: 'src/utils/{NAME}.ts' },
  steps: [
    { promptTemplate: 'Add an explicit return type to every export in @{FILE}.' },
    check(1),
  ],
})
```

`continueOnError` lets a red run reach `postCommandExecFn` instead of failing the context. On the last attempt it is `false`, so a still-red suite fails the context. The fix prompt uses `promptFn` so the raw output is not scanned for `{VAR}`.

## Run a step only when needed

A cheap first pass decides; an expensive second pass runs only when needed.

```ts config.ts
import { defineConfig } from '@lumpcode/cli-utils'

export default defineConfig({
  command: 'cursor',
  contextListJson: { PKG: 'packages/{NAME}/package.json' },
  steps: [
    {
      promptTemplate: 'Is any dependency in @{PKG} more than two majors behind? Reply NEEDS_BUMP or OK. Do not edit.',
      stepVariables: { model: 'fast-cheap-model' },
      postCommandExecFn({ commandResult, contextRunState }) {
        contextRunState.needsBump = commandResult.includes('NEEDS_BUMP')
      },
    },
    ({ contextRunState }) =>
      contextRunState.needsBump
        ? [{ promptTemplate: 'Bump outdated dependencies in @{PKG} to the latest minor, run the tests, fix what breaks.' }]
        : [],
  ],
})
```

`stepVariables.model` overrides the lump's model for one step. `contextRunState` is one object shared by every step of a context.

## Start a dev server for the agent

Give the agent a running app to click through, one per branch workspace, so parallel worktrees do not collide.

```ts .lumpcode/helpers/devServer.ts
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'

const servers = new Map<string, ChildProcess>()
let nextPort = 5173

export async function startDevServer(workspacePath: string): Promise<string> {
  execFileSync('npm', ['ci'], { cwd: workspacePath, stdio: 'ignore' })
  const port = nextPort++
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port)], { cwd: workspacePath, detached: true, stdio: 'ignore' })
  servers.set(workspacePath, child)
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 60; i++) {
    if (await fetch(url).then(() => true, () => false)) return url
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Dev server did not answer on ${url}`)
}

export function stopDevServer(workspacePath: string): void {
  const child = servers.get(workspacePath)
  if (child?.pid !== undefined) process.kill(-child.pid)
  servers.delete(workspacePath)
}
```

Call `startDevServer` from `postSetupWorkspaceFn` and `stopDevServer` from `postTeardownWorkspaceFn`. A full lump that uses it: [Labelled bugs, verified in a browser](issue-queues.md#labelled-bugs-verified-in-a-browser). Shared code goes in `.lumpcode/helpers/`, imported with a relative path.

## Open a pull request after push

Lumpcode stops at `git push`. On GitHub, `openPrPostTeardown` opens the PR (it needs `gh` on `PATH`):

```ts config.ts
import { openPrPostTeardown } from '@lumpcode/recipes'

postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
```

On another host, write the hook yourself. It runs after the push, in the branch workspace:

```ts .lumpcode/helpers/openAzurePr.ts
import { execFileSync, spawnSync } from 'node:child_process'
import type { PostTeardownWorkspaceFn } from '@lumpcode/cli-utils'

export const openAzurePr: PostTeardownWorkspaceFn = ({ branchName, baseBranch, contextList, workspacePath }) => {
  const pushed = spawnSync('git', ['ls-remote', '--exit-code', '--heads', 'origin', branchName], { cwd: workspacePath })
  if (pushed.status !== 0) return
  try {
    execFileSync('az', [
      'repos', 'pr', 'create',
      '--source-branch', branchName,
      '--target-branch', baseBranch,
      '--title', `LUMP: ${contextList.map((context) => context.name).join(', ')}`,
    ], { cwd: workspacePath, stdio: 'ignore' })
  } catch (error) {
    console.warn(`No PR for ${branchName}: ${String(error)}`)
  }
}
```

GitLab is the same with `glab mr create --source-branch … --target-branch … --title … --yes`. Catch errors: a PR that already exists should not fail the run.

## Pause when downstream is full

`disabled` can be a function. It runs on every pass, so a lump can switch itself off while the work it feeds is piling up, and back on once you catch up.

```ts config.ts
import fs from 'node:fs'

disabled: () => fs.readdirSync('.lumpcode/lumps/refactors/backlogItems/todo').length >= 3,
```

To pause by hand, set `"disabled": true`, push, and merge. The worker keeps running and skips the lump. Capping open PRs is built in: `maximumNumberOfConcurrentBranches`.

## Different schedules per lump

Commit one file per daemon under `.lumpcode/daemons/` and the worker starts them from git: here, a daily triage and everything else every five minutes.

```json .lumpcode/daemons/main.json
{
  "discoveryBranch": "main",
  "exclude": ["triage"]
}
```

```json .lumpcode/daemons/triage.json
{
  "discoveryBranch": "main",
  "include": ["triage"],
  "cronSetup": "0 7 * * *"
}
```

On the worker, run `lumpcode start --superviseOnly` once so only these files start daemons. Change a file, push, and the worker restarts that daemon. Details: [Daemon files](../config/daemons.md).

## Keep secrets out of git

Lumps that call an API need a token on the worker. Keep it in a gitignored file and load it from the config:

```ts config.ts
import fs from 'node:fs'

if (fs.existsSync('.lumpcode/.env')) process.loadEnvFile('.lumpcode/.env')
```

Add `.lumpcode/.env` to `.gitignore`. The token then lives only on the machines that need it.
