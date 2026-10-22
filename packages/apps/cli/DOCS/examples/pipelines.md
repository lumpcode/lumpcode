# Lumps that feed lumps

One lump's output is another lump's input: a triage lump writes tickets that backlog lumps implement, a finder files refactors that an implementer picks up. Everything passes through git, so every hand-off is a PR you can read and correct.

## Triage an inbox into lanes

Keep a single `IDEAS.yaml` (or `TODO.md`) where anyone drops rough ideas. Once a day, a triage lump turns the ready ones into proper tickets in the right [backlog lane](backlogs.md#lanes-that-share-one-factory). It skips the day when there is nothing to triage, and pauses while the lanes already have enough work.

```yaml IDEAS.yaml
- name: csv-export
  task: Users keep asking to export the orders table.
- name: faster-search
  task: Search feels slow on big accounts. Maybe debounce?
  blocked: waiting for the analytics numbers
```

```ts .lumpcode/lumps/triage/config.ts
import fs from 'node:fs'
import { defineConfig, readYamlList } from '@lumpcode/cli-utils'

const LANES = ['backlog', 'qol', 'bugfixes']
const MAX_TODO_PER_LANE = 3
const todoCount = (lane: string) =>
  fs.readdirSync(`.lumpcode/lumps/${lane}/backlogItems/todo`, { withFileTypes: true }).filter((e) => e.isDirectory()).length

export default defineConfig({
  command: 'cursor',
  disabled: () => LANES.every((lane) => todoCount(lane) >= MAX_TODO_PER_LANE),
  async getContextListFn() {
    const ideas = await readYamlList<{ name: string; blocked?: string }>('IDEAS.yaml')
    if (!ideas.some((idea) => !idea.blocked)) return []
    return [{ name: new Date().toISOString().slice(0, 10), variables: {} }]
  },
  prompt: { promptTemplate: 'Follow @.agents/skills/ideas-to-backlog/SKILL.md for every unblocked idea in @IDEAS.yaml.' },
  maximumNumberOfConcurrentBranches: 1,
})
```

```json .lumpcode/daemons/triage.json
{
  "discoveryBranch": "main",
  "include": ["triage"],
  "cronSetup": "0 7 * * *"
}
```

- **A daily schedule.** The daemon file runs triage at 07:00; exclude it from your main daemon so it does not also run every five minutes. See [Different schedules per lump](building-blocks.md#different-schedules-per-lump).
- **One context per day.** The context name is the date, so each day gets at most one triage branch, and a day that already ran is `finished` once you merge it.
- **Back-pressure.** `disabled` is a function, evaluated every pass. When every lane has three tickets waiting, triage stops producing more.
- **The skill holds the rules**: how to pick a lane, write a `desc.yml`, and remove the idea from the inbox. The config stays about scheduling.
- The step can also start a cloud agent instead of a local one: a `commandFn` that calls your provider's SDK and returns nothing, so no local process runs.

## Find, file, implement

Two lumps. The **finder** runs a duplicate-code detector, picks one new refactor, and writes it up as a ticket in the implementer's backlog. The **implementer** works through those tickets with your build as the gate. The finder only files a new ticket while fewer than `maxPendingAbstractions` are waiting.

```ts .lumpcode/lumps/findDuplication/config.ts
import { abstractionFinder } from '@lumpcode/recipes'

export default abstractionFinder({
  configUrl: import.meta.url,
  command: 'copilot',
  backlogItemsDir: '.lumpcode/lumps/refactors/backlogItems',
  maxPendingAbstractions: 1,
  scanCommand: 'npx jscpd src --reporters json --output .jscpd',
  steps: [{
    promptTemplate:
      'Using .jscpd/jscpd-report.json, find exactly one new helper that removes duplicated logic in @src. ' +
      'Write todo/<name>/desc.yml and todo/<name>/requirements.md (typed signature, call sites to change) ' +
      'under @{BACKLOG_ITEMS_DIR}. Skip names already in todo/ or completed/. Do not write code.',
  }],
})
```

```ts .lumpcode/lumps/refactors/config.ts
import { abstractionBacklog } from '@lumpcode/recipes'

export default abstractionBacklog({
  configUrl: import.meta.url,
  command: 'copilot',
  implValidateCommand: 'npm run lint && npm run build && npm test',
  maximumNumberOfConcurrentBranches: 1,
})
```

- You review the **ticket** PR first. Reject a bad idea there, before any code exists.
- `maxPendingAbstractions: 1` means one refactor at a time: find, review, implement, merge, then find the next.
- `scanCommand` runs before the agent; `steps` replaces only the recipe's default prompt. Omit both and the default prompt hunts in `scanDirectories` on its own. Any duplicate detector that writes a report works.

## Wait on another lump

A downstream lump can wait for a specific context of another lump to be **merged**. Write the dependency as `<otherLumpName>/<contextName>`.

```json .lumpcode/lumps/apiDocs/config.json
{
  "command": "cursor",
  "contextListJson": { "ROUTE": "src/routes/{NAME}.ts" },
  "contextOptionsFn": "./options.ts",
  "prompt": { "promptTemplate": "Document the endpoints in @{ROUTE} in docs/api/{NAME}.md." }
}
```

```ts .lumpcode/lumps/apiDocs/options.ts
export default function contextOptionsFn({ name }) {
  return { dependsOnContexts: [`apiV2Migration/${name}`] }
}
```

Each route's docs wait until that route's migration (context `<name>` of lump `apiV2Migration`) is merged. Routes that are not migrated yet are skipped, not failed, and picked up on a later pass.
