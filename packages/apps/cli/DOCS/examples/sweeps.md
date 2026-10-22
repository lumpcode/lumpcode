# Migrations and sweeps

Lumps that walk the codebase: one component, file, or module per context, until nothing matches anymore.

## A migration that shrinks as it goes

Move every Vue component from scoped CSS to Tailwind classes. The matcher only picks components that **still** have a `<style>` block, so migrated ones drop out of the list and the campaign ends by itself.

```ts .lumpcode/lumps/cssToTailwind/config.ts
import fs from 'node:fs'
import { defineConfig } from '@lumpcode/cli-utils'

export default defineConfig({
  command: 'copilot',
  contextMatchFn({ codeBasePath: { isDir, path } }) {
    const match = /^src\/components\/([^/]+)\/\1\.vue$/.exec(path)
    if (isDir || match === null) return null
    if (!fs.readFileSync(path, 'utf8').includes('<style')) return null
    return { contextName: match[1], filePathVariableName: 'VUE_FILE' }
  },
  prompt: { promptTemplate: 'tailwind.md' },
  numberOfContextsPerBranch: 3,
  maximumNumberOfConcurrentBranches: 2,
})
```

```md .lumpcode/lumps/cssToTailwind/tailwind.md
Replace as much of the CSS in @{VUE_FILE} as possible with Tailwind classes.
Behavior and rendering must not change.

- If a group of classes repeats, put it in one well-named variable in the component.
- Keep CSS that overrides a third-party component when the Tailwind version would be messy.
- Before removing a class name, check that no test selects on it. If one does, keep the name.
- Look at components that are already Tailwind-only for the house style.
```

- Three components per branch keeps each PR reviewable; two open branches at most keeps the queue from outrunning review.
- The prompt is a file next to the config, so it reads like instructions to a colleague and diffs cleanly.
- The same shape works for React to Vue, class components to hooks, or one test runner to another. Change the matcher's "still to do" test.

## A codemod, ten files per PR

Remove a dependency file by file. Each file is a context; ten share a branch, so the reviewer sees one PR per ten files instead of ten one-line PRs.

```json .lumpcode/lumps/dropLodash/config.json
{
  "command": "cursor",
  "contextMatchFn": "./match.ts",
  "numberOfContextsPerBranch": 10,
  "prompt": {
    "promptTemplate": "Rewrite @{FILE} to stop importing lodash. Use native equivalents and keep behavior identical."
  }
}
```

```ts .lumpcode/lumps/dropLodash/match.ts
import fs from 'node:fs'

export default function match({ codeBasePath: { isDir, path } }) {
  if (isDir || !/\.(ts|tsx|js|jsx)$/.test(path)) return null
  if (!/from ['"]lodash/.test(fs.readFileSync(path, 'utf8'))) return null
  return { contextName: path.replaceAll('/', '_').replaceAll('.', '_'), filePathVariableName: 'FILE' }
}
```

JSON configs point at code by path. `contextMatchFn` here is a module next to the config.

## An inventory, then a migration

Some migrations need a human or a script to decide the scope first. Write the list once, commit it next to the lump, and let the lump work through it with per-file hints.

```json .lumpcode/lumps/unifyNumberFormat/candidates.json
[
  { "name": "orders-table", "variables": { "FILE": "src/orders/OrdersTable.vue", "LEGACY": "formatPrice, toFixed2" } },
  { "name": "kpi-card", "variables": { "FILE": "src/dashboard/KpiCard.vue", "LEGACY": "formatPercent" } }
]
```

```ts .lumpcode/lumps/unifyNumberFormat/config.ts
import { defineConfig } from '@lumpcode/cli-utils'
import { retryUntilGreen, shellCommand } from '@lumpcode/recipes'

export default defineConfig({
  command: 'copilot',
  contextListJson: './candidates.json',
  steps: retryUntilGreen({
    steps: [{
      promptTemplate:
        'In @{FILE}, replace the legacy number helpers ({LEGACY}) with formatNumber from src/utils/formatNumber. Output must render the same.',
    }],
    validationCommandFn: () => shellCommand('npm run lint && npm run typecheck'),
  }),
})
```

A list in a file is taken as written: files do not have to exist yet, and each item can carry its own variables. Regenerate the file when the scope changes; finished items stay finished because status comes from git, not from the list.

## One standard per module

Bring every helper under `src/utils/` to the same layout (`main.ts`, `index.ts`, `unit.test.ts`). The prompt is one line because the repo already has a skill that explains the standard. The check verifies the layout and runs that module's tests.

```ts .lumpcode/lumps/utilCleanup/config.ts
import { defineConfig } from '@lumpcode/cli-utils'
import { retryUntilGreen, shellCommand } from '@lumpcode/recipes'

export default defineConfig({
  command: 'copilot',
  contextMatchFn({ codeBasePath: { path } }) {
    const match = /^src\/utils\/([^/.]+)(\.ts)?$/.exec(path)
    if (match === null || match[1] === 'index') return null
    return { contextName: match[1], filePathVariableName: 'UTIL_PATH', moreContextVariables: { UTIL: match[1] } }
  },
  steps: retryUntilGreen({
    steps: [{ promptTemplate: 'Follow @.agents/skills/util-cleaning/SKILL.md for the util at @{UTIL_PATH}.' }],
    validationCommandFn: ({ context }) => {
      const dir = `src/utils/${context.variables.UTIL}`
      return shellCommand(
        `test -f ${dir}/main.ts && test -f ${dir}/index.ts && test -f ${dir}/unit.test.ts` +
          ` && npm run typecheck && npx vitest run ${dir}`,
      )
    },
    maxIterations: 4,
  }),
  numberOfContextsPerBranch: 2,
  maximumNumberOfConcurrentBranches: 1,
})
```

The matcher accepts both a folder (`src/utils/slugify/`) and a loose file (`src/utils/slugify.ts`), so already-clean and not-yet-clean utils share one context name.

## Tests where they are missing

Every source file without a sibling `.test.ts` becomes a context. Once the test exists, the file stops matching.

```ts .lumpcode/lumps/addTests/match.ts
import fs from 'node:fs'

export default function match({ codeBasePath: { isDir, path } }) {
  if (isDir || !path.startsWith('src/') || !path.endsWith('.ts')) return null
  if (path.endsWith('.test.ts') || path.endsWith('.d.ts')) return null
  if (fs.existsSync(path.replace(/\.ts$/, '.test.ts'))) return null
  return { contextName: path.replaceAll('/', '_').replace(/\.ts$/, ''), filePathVariableName: 'SOURCE' }
}
```

```json .lumpcode/lumps/addTests/config.json
{
  "command": "cursor",
  "contextMatchFn": "./match.ts",
  "maximumNumberOfConcurrentBranches": 5,
  "prompt": {
    "promptTemplate": "Write a Vitest suite for @{SOURCE}, saved next to it as .test.ts. Cover every exported function. Run it and make it pass."
  }
}
```
