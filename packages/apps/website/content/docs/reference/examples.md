---
title: Examples
description: Copy a shape, change the paths and the prompt, preview with lump-plan. Mix sources and steps; these are starting points, not a closed list.
---

Each example is a drop-in `.lumpcode/lumps/<name>/` config. After a run, Lumpcode has pushed a branch. You open the pull request.

## Smoke test

Confirm remotes, the agent binary, and marker commits before you invest in a real campaign. Uses `README.md` so most repos match immediately.

```json .lumpcode/lumps/smokeTest/config.json
{
  "contextListJson": {
    "FILE": "README.md"
  },
  "prompt": {
    "promptTemplate": "Reply with exactly one line: smoke OK for @{FILE}. Do not edit any file.",
    "command": "cursor"
  }
}
```

```bash
lumpcode run smokeTest
lumpcode lump-status --lumpName smokeTest
```

## One component per branch

Migration campaign. Several files share one context because they share `{COMPONENT_NAME}`.

```json .lumpcode/lumps/portToVue/config.json
{
  "command": "cursor",
  "contextListJson": {
    "FOLDER": "src/components/{COMPONENT_NAME}/",
    "TYPES": "src/components/{COMPONENT_NAME}/{COMPONENT_NAME}.types.ts",
    "TEST": "src/components/{COMPONENT_NAME}/{COMPONENT_NAME}.test.ts",
    "COMPONENT": "src/components/{COMPONENT_NAME}/$upperFirst{COMPONENT_NAME}.tsx"
  },
  "steps": [
    "Read @{COMPONENT}, @{TYPES}, and @{TEST}. Write a short plan to src/components_vue/{COMPONENT_NAME}/migration-plan.md. No source changes.",
    "Following that plan, port @{COMPONENT} to Vue 3 <script setup> at src/components_vue/{COMPONENT_NAME}/{COMPONENT_NAME}.vue. Keep behavior identical.",
    "Port @{TEST} to Vitest + @vue/test-utils next to the Vue file. Run the tests and fix what breaks."
  ]
}
```

Already-migrated names are skipped once their marker is on the integration branch.

## Ticket queue

Later work waits until earlier tickets are **merged**, not merely pushed.

```json .lumpcode/lumps/tickets/config.json
{
  "command": "cursor",
  "getContextListFn": "./tickets.ts",
  "postSetupWorkspaceCommand": "npm ci",
  "prompt": {
    "promptTemplate": "Implement ticket {TICKET_ID}: {TITLE}\n\nAcceptance criteria:\n{ACCEPTANCE}\n\nLikely files:\n{FILE_HINT}"
  }
}
```

```ts .lumpcode/lumps/tickets/tickets.ts
export default function getContextListFn() {
  return [
    {
      name: '01-schema',
      variables: {
        TICKET_ID: 'PROF-1',
        TITLE: 'Add user_profile table',
        ACCEPTANCE: '- migration runs\n- bio, avatarUrl, createdAt',
        FILE_HINT: 'prisma/schema.prisma',
      },
      options: { priority: 1 },
    },
    {
      name: '02-api',
      variables: {
        TICKET_ID: 'PROF-2',
        TITLE: 'GET/PATCH /me/profile',
        ACCEPTANCE: '- 401 when unauth',
        FILE_HINT: 'apps/api/src/routes/profile.ts',
      },
      options: { priority: 2, dependsOnContexts: ['01-schema'] },
    },
  ]
}
```

Pair with a [worker](/docs/start/worker). Each pass picks the next eligible ticket.

## Coverage sweep

Path patterns are not enough; skip files that already have a test.

```json .lumpcode/lumps/coverage/config.json
{
  "command": "cursor",
  "contextMatchFn": "./match.ts",
  "maximumNumberOfConcurrentBranches": 5,
  "prompt": {
    "promptTemplate": "Write a Vitest suite for @{SOURCE}. Save it next to the module as .test.ts."
  }
}
```

```ts .lumpcode/lumps/coverage/match.ts
import fs from 'node:fs'

export default function match({ codeBasePath }) {
  const { isDir, path } = codeBasePath
  if (isDir) return null
  if (!path.startsWith('src/') || !path.endsWith('.ts')) return null
  if (path.endsWith('.test.ts') || path.endsWith('.d.ts')) return null
  if (fs.existsSync(path.replace(/\.ts$/, '.test.ts'))) return null
  return {
    contextName: path.replaceAll('/', '_').replace(/\.ts$/, ''),
    filePathVariableName: 'SOURCE',
  }
}
```

The cap keeps five test PRs in flight until you merge.

## Small mechanical edits, batched

Group ten files per branch so review is not a pile of one-line PRs.

```json .lumpcode/lumps/dropLodash/config.json
{
  "command": "cursor",
  "contextMatchFn": "./match.ts",
  "numberOfContextsPerBranch": 10,
  "prompt": {
    "promptTemplate": "Rewrite @{FILE} to remove lodash. Use native ES equivalents. Keep behavior identical."
  }
}
```

```ts .lumpcode/lumps/dropLodash/match.ts
import fs from 'node:fs'

export default function match({ codeBasePath }) {
  const { isDir, path } = codeBasePath
  if (isDir || !/\.(ts|tsx|js|jsx)$/.test(path)) return null
  const src = fs.readFileSync(path, 'utf8')
  if (!/from ['"]lodash/.test(src)) return null
  return { contextName: path.replaceAll('/', '_'), filePathVariableName: 'FILE' }
}
```

## Docs per package

```json .lumpcode/lumps/pkgDocs/config.json
{
  "command": "cursor",
  "contextListJson": {
    "PKG_FOLDER": "packages/{PKG}/",
    "PKG_JSON": "packages/{PKG}/package.json",
    "PKG_ENTRY": "packages/{PKG}/src/index.ts"
  },
  "steps": [
    "Read @{PKG_JSON} and @{PKG_ENTRY}. Write or rewrite packages/{PKG}/README.md: install, one example, top exports. Keep it under 200 lines."
  ]
}
```

## Conditional second pass

Skip the expensive prompt when the first step says nothing to do. Needs JS/TS.

```ts .lumpcode/lumps/depBump/config.ts
import { defineConfig } from '@lumpcode/cli-utils'

export default defineConfig({
  command: 'cursor',
  contextListJson: { PKG_JSON: 'packages/{PKG}/package.json' },
  steps: [
    {
      promptTemplate:
        'Inspect @{PKG_JSON}. If a direct dependency is more than two majors behind, reply NEEDS_BUMP. Else OK.',
      postCommandExecFn({ commandResult, contextRunState }) {
        contextRunState.needsBump = commandResult.includes('NEEDS_BUMP')
      },
    },
    ({ contextRunState }) =>
      contextRunState.needsBump
        ? [{ promptTemplate: 'Bump outdated direct deps in @{PKG_JSON} to latest minor. Run tests.' }]
        : [],
  ],
})
```

## Cross-lump wait

Downstream lump waits on an upstream context **name** using `otherLump/contextName`. Until that marker is on the integration branch, every downstream context is skipped.

```ts contextOptions.ts
export default function contextOptionsFn() {
  return { dependsOnContexts: ['scaffoldApi/README'] }
}
```

Wire that as `contextOptionsFn` on the docs lump. Same-lump queues belong in `getContextListFn` options instead.

## Retry until green

A step with `commandFn` and no prompt runs `npm test`. Each node is a `StepFn`; `postCommandExecFn` calls the next node with the same `input`. Prefer `retryUntilGreen` from [@lumpcode/recipes](/docs/author/recipes) when you want an attempt cap.

```ts .lumpcode/lumps/typedExports/config.ts
import { defineConfig, type StepFn } from '@lumpcode/cli-utils'

const done: StepFn = () => ({
  commandFn() {
    return { executable: 'echo', args: ['Tests passed'] }
  },
})

const fix: StepFn = () => [
  { promptTemplate: 'The tests failed. Fix them.' },
  test,
]

const test: StepFn = () => ({
  commandFn() {
    return { executable: 'npm', args: ['test'] }
  },
  continueOnError: true,
  postCommandExecFn(input) {
    if (input.commandSucceeded) return done(input)
    return fix(input)
  },
})

const edit: StepFn = () => [
  { promptTemplate: 'Add an explicit return type to every export in @{FILE}.' },
  test,
]

export default defineConfig({
  command: 'cursor',
  contextListJson: { FILE: 'src/utils/{NAME}.ts' },
  postSetupWorkspaceCommand: 'npm ci',
  steps: edit,
})
```

`test` calls `done(input)` or `fix(input)`. `continueOnError: true` lets a red suite take the `fix` branch. This retries until green. `retryUntilGreen` is the capped form so the last failure stays `toDo`.
