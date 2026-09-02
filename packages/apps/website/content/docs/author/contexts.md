---
title: Contexts
description: A context is one unit of work. Pick one way to discover them. Order them with priority and dependencies if the campaign is a queue.
---

A context has:

- **`name`** — unique id. Letters, digits, `_`, `-` only. No `/`. This becomes the default branch suffix and the marker commit suffix.
- **`variables`** — string map. Prompt `{VAR}` / `@{VAR}` read from here, not from lump-level options.
- **`options`** (optional) — `priority` (lower runs sooner) and `dependsOnContexts`.

One context can be one file, a component folder plus its test, or a ticket with no files yet. Several contexts can share a branch with `numberOfContextsPerBranch`.

## Pick one source

### `contextListJson` — path patterns

Each key is a variable. Each value is a path template. Lumpcode scans the repo; every real path that fits the template becomes (or joins) a context.

```json config.json
{
  "contextListJson": {
    "COMPONENT": "src/components/{NAME}/index.tsx",
    "TEST": "src/components/{NAME}/index.test.tsx"
  }
}
```

`{NAME}` captures a path segment. All placeholders in one template must match the same real path. The context **name** is the captured value (several captures joined with `-`).

Write templates without a leading `./`. Prefer `src/{NAME}.ts` over `./src/{NAME}.ts`.

**Naming-convention modifiers** require the on-disk text to equal the transformed capture:

| Token | On disk must equal |
| --- | --- |
| `$upperFirst` | `UpperFirst` |
| `$camel` | `camelCase` |
| `$kebab` | `kebab-case` |
| `$snake` | `snake_case` |
| `$lower` | `lowercase` |
| `$pascal` | `PascalCase` |

```json
"COMPONENT": "src/components/{NAME}/$upperFirst{NAME}.tsx"
```

`contextListJson` can be an inline object or a path to a JSON file. It does not set `options`. Attach those with `contextOptionsFn` (JS/TS inline, or a module path from any format).

```ts contextOptions.ts
export default function contextOptionsFn({ name }) {
  if (name === 'api') return { priority: 2, dependsOnContexts: ['schema'] }
}
```

### `getContextListFn` — a list you build

Return `{ name, variables, options? }[]`. Use this for tickets, YAML folders, or anything that is not a file glob.

```ts tickets.ts
export default function getContextListFn() {
  return [
    {
      name: '01-schema',
      variables: { TICKET: 'add user_profile table' },
      options: { priority: 1 },
    },
    {
      name: '02-api',
      variables: { TICKET: 'GET/PATCH /me/profile' },
      options: { priority: 2, dependsOnContexts: ['01-schema'] },
    },
  ]
}
```

Variable values **must be strings**. They are substituted into prompts and sometimes into paths.

The function receives `codeBasePaths`, `lumpVariables`, and a concrete `discoveryBranch`. Filter per branch here if one lump should do different work on `dev` versus `feature/foo`.

```ts tickets.ts
export default function getContextListFn({ discoveryBranch }) {
  if (discoveryBranch === 'dev') {
    return [{ name: 'smoke', variables: { TASK: 'lint only' } }]
  }
  return [{ name: 'full', variables: { TASK: 'implement the feature' } }]
}
```

### `contextMatchFn` — scan and skip

Called once per scanned path. Return `null` to skip, or `{ contextName, filePathVariableName, contextOptions? }` to include. Matches that share a `contextName` **merge** (variables accumulate; later keys win).

```ts match.ts
import fs from 'node:fs'

export default function match({ codeBasePath }) {
  const { isDir, path } = codeBasePath
  if (isDir || !path.endsWith('.ts') || path.endsWith('.test.ts')) return null
  if (fs.existsSync(path.replace(/\.ts$/, '.test.ts'))) return null
  return {
    contextName: path.replaceAll('/', '_').replace(/\.ts$/, ''),
    filePathVariableName: 'SOURCE',
  }
}
```

Each call also gets the full `codeBasePaths` list when skip logic needs a neighbor file.

## Ordering

| Field | Effect |
| --- | --- |
| `priority` | Lower runs first among contexts that already pass dependency checks. |
| `dependsOnContexts` | Every listed name must be **`finished`** on the remote integration branch. `branchPushed` does not count. |

Same-lump deps are a context `name`. Cross-lump deps are `<otherLumpName>/<contextName>`. The slash is only legal in that dependency string, never in a context `name`.

Until `LUMP: otherLump - someContext` is an ancestor of `origin/<baseBranch>`, this context stays ineligible.

```ts tickets.ts
{
  name: '02-api',
  variables: { TICKET: 'GET /me' },
  options: { priority: 2, dependsOnContexts: ['01-schema'] },
}
```

## Discovery versus execution

On a dedicated worker, a lump can declare `discoveryBranch` / `discoveryBranches` (exact names or git globs such as `feature/*`). That is **where the lump is found and scheduled**. Work still branches off `baseBranch` (or the same concrete discovery branch if you omit `baseBranch`).

Shared mode on a laptop ignores those discovery rules for `run`. Inspect commands (`lump-plan`, `lump-status`) can still honor `--discoveryBranch` to filter contexts without checking out.

Pattern-only discovery (`feature/*` with no exact name) needs `--discoveryBranch <concrete>` on dedicated manual commands.

```ts config.ts
import { defineConfig } from '@lumpcode/cli-utils'

export default defineConfig({
  discoveryBranches: ['dev', 'feature/*'],
  baseBranch: 'dev',
  command: 'cursor',
  contextListJson: { FILE: 'src/{NAME}.ts' },
  prompt: { promptTemplate: 'Improve types in @{FILE}.' },
})
```

Full field list: [lump config](/docs/config/lump). Runnable shapes: [examples](/docs/reference/examples).
