# Contexts

A context is one unit of work: a file, a component and its test, a ticket, a package. Pick one way to find them, then order them if the campaign is a queue.

Every context has:

- **`name`**: unique, letters, digits, `_` and `-` only. It names the branch and the marker commit.
- **`variables`**: strings that fill `{VAR}` and `@{VAR}` in prompts.
- **`options`** (optional): `priority` (lower runs sooner) and `dependsOnContexts`.

## Path patterns: `contextListJson`

The most common source. Each key becomes a variable, each value is a path with `{…}` captures. Lumpcode scans the repo and creates one context per capture where **every** path exists.

```json config.json
{
  "contextListJson": {
    "COMPONENT": "src/components/{NAME}/index.tsx",
    "TEST": "src/components/{NAME}/index.test.tsx"
  }
}
```

With `src/components/UserCard/` and `src/components/DataTable/` both holding the two files, that is two contexts, `UserCard` and `DataTable`. A folder missing its test is skipped. Several captures are joined with `-` in the name. Write paths without a leading `./`.

When file names follow a naming convention, a modifier makes the on-disk text match the transformed capture:

```json
"COMPONENT": "src/components/{NAME}/$upperFirst{NAME}.tsx"
```

| Modifier | On disk |
| --- | --- |
| `$upperFirst` | `UpperFirst` |
| `$camel` | `camelCase` |
| `$pascal` | `PascalCase` |
| `$kebab` | `kebab-case` |
| `$snake` | `snake_case` |
| `$lower` | `lowercase` |

## A fixed list

An array is taken as written. Files named in `variables` do not have to exist.

```json config.json
{
  "contextListJson": [
    { "name": "README", "variables": { "FILE": "README.md" } },
    { "name": "CONTRIBUTING", "variables": { "FILE": "CONTRIBUTING.md" } }
  ]
}
```

`contextListJson` can also be a path to a JSON file holding either shape.

## Built in code: `getContextListFn`

Return `{ name, variables, options? }[]` from anywhere: a folder of tickets, a YAML file, your issue tracker, a code-quality API. Variable values must be strings.

```ts tickets.ts
export default async function getContextListFn() {
  const issues = await fetch('https://tracker.example.com/api/issues?label=agent').then((r) => r.json())
  return issues.map((issue) => ({
    name: `issue-${issue.id}`,
    variables: { TITLE: issue.title, BODY: issue.body },
    options: { priority: issue.severity },
  }))
}
```

```json config.json
{ "getContextListFn": "./tickets.ts" }
```

The function receives `codeBasePaths` (every file in the repo), `lumpVariables`, and the `discoveryBranch` being scanned, so one lump can return different work per branch. Real versions of this: [Fix what a tool reports](../examples/issue-queues.md). For ticket folders, use the [folder backlog](backlog.md) recipe instead of writing your own.

## Scan and decide: `contextMatchFn`

Called once per file and folder in the repo. Return `null` to skip, or a context to include.

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

Matches that return the same `contextName` merge into one context, so you can group several files. Each call also gets the full `codeBasePaths` list.

## Order and dependencies

| Option | Effect |
| --- | --- |
| `priority` | Lower runs first. |
| `dependsOnContexts` | Wait until every listed context is **finished** (merged), not just pushed. |

```ts tickets.ts
[
  { name: '01-schema', variables: { TICKET: 'Add the user_profile table' }, options: { priority: 1 } },
  { name: '02-api', variables: { TICKET: 'GET/PATCH /me/profile' }, options: { priority: 2, dependsOnContexts: ['01-schema'] } },
]
```

To wait on another lump, write `<otherLumpName>/<contextName>`. The `/` is only allowed there, never in a context `name`.

Path patterns cannot carry options inline. Attach them with `contextOptionsFn`, a function (or module path) that receives each context and returns its options:

```ts contextOptions.ts
export default function contextOptionsFn({ name }) {
  if (name === 'api') return { priority: 2, dependsOnContexts: ['schema'] }
}
```

## Group several per branch

`"numberOfContextsPerBranch": 10` puts ten contexts on one branch, one marker commit each. Use it when diffs are small and ten one-line PRs would waste review time.

Per-branch discovery (`discoveryBranch`, `discoveryBranches`) is explained in [How a run works](../start/run.md#several-branches). Every field: [Lump config](../config/lump.md).
