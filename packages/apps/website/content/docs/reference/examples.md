---
title: Examples
description: Copy a shape, change the paths and the prompt, preview with lump-plan. Mix sources and steps; these are starting points, not a closed list.
---

Each example is a drop-in `.lumpcode/lumps/<name>/` config. After a run, Lumpcode has pushed a branch. You open the pull request.

## Smoke test

Confirm remotes, the agent binary, and marker commits before you invest in a real campaign. Uses `README.md` so most repos match immediately.

```json
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

```json
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

`config.json`:

```json
{
  "command": "cursor",
  "getContextListFn": "./tickets.js",
  "postSetupWorkspaceCommand": "npm ci",
  "prompt": {
    "promptTemplate": "Implement ticket {TICKET_ID}: {TITLE}\n\nAcceptance criteria:\n{ACCEPTANCE}\n\nLikely files:\n{FILE_HINT}"
  }
}
```

`tickets.js`:

```js
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

```json
{
  "command": "cursor",
  "contextMatchFn": "./match.js",
  "maximumNumberOfConcurrentBranches": 5,
  "prompt": {
    "promptTemplate": "Write a Vitest suite for @{SOURCE}. Save it next to the module as .test.ts."
  }
}
```

```js
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

```json
{
  "command": "cursor",
  "contextMatchFn": "./match.js",
  "numberOfContextsPerBranch": 10,
  "prompt": {
    "promptTemplate": "Rewrite @{FILE} to remove lodash. Use native ES equivalents. Keep behavior identical."
  }
}
```

Matcher: skip unless the file imports `lodash`. Context name from the path.

## Docs per package

```json
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

```js
export default {
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
}
```

## Cross-lump wait

Downstream lump waits on an upstream context **name** using `otherLump/contextName`. Until that marker is on the integration branch, every downstream context is skipped.

```js
export default function contextOptionsFn() {
  return { dependsOnContexts: ['scaffoldApi/README'] }
}
```

Wire that as `contextOptionsFn` on the docs lump. Same-lump queues belong in `getContextListFn` options instead.

## Retry until green

A step with `commandFn` and no prompt runs `npm test`. Failures return a fix prompt plus the next verify, until the cap. Prefer `retryUntilGreen` from [@lumpcode/recipes](/docs/author/recipes); this is the loop it wraps.

```js
const MAX = 4

function verify(attempt) {
  return {
    commandFn: () => ({ executable: 'npm', args: ['test'] }),
    continueOnError: attempt < MAX,
    postCommandExecFn({ commandSucceeded, commandResult }) {
      if (commandSucceeded || attempt >= MAX) return
      return [
        {
          promptFn: () => `The test suite still fails. Fix it.\n\n${commandResult}`,
        },
        verify(attempt + 1),
      ]
    },
  }
}

export default {
  command: 'cursor',
  contextListJson: { FILE: 'src/utils/{NAME}.ts' },
  postSetupWorkspaceCommand: 'npm ci',
  steps: [
    { promptTemplate: 'Add an explicit return type to every export in @{FILE}.' },
    verify(1),
  ],
}
```

The last attempt leaves `continueOnError` false, so a still-red suite skips commit and push. The context stays `toDo`.
