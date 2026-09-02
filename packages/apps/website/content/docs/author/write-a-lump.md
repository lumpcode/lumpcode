---
title: Write a lump
description: A runnable lump is two things: a list of units of work, and something to run on each one. Everything else is optional.
---

A lump lives at `.lumpcode/lumps/<lumpName>/`. The file the CLI loads is `config.ts`, `config.js`, or `config.json`. If several exist, precedence is **TypeScript, then JavaScript, then JSON**.

## Create the folder

```bash
lumpcode lump-create myLump
lumpcode lump-create myLump --config ts
```

Default is JSON. Use TypeScript (or JavaScript) as soon as you need inline functions, retries, or a computed context list. JSON cannot hold functions; those fields must be string paths to modules.

For editor hints:

```bash
npm install --save-dev @lumpcode/cli-utils @lumpcode/recipes
```

```ts .lumpcode/lumps/myLump/config.ts
import { defineConfig } from '@lumpcode/cli-utils'

export default defineConfig({
  contextListJson: { FILE: 'src/{NAME}.ts' },
  prompt: {
    promptTemplate: 'Add an explicit return type to every export in @{FILE}.',
    command: 'cursor',
  },
})
```

Prefer `@lumpcode/cli-utils` for new configs. `@lumpcode/cli-types` still works.

## The two required pieces

**1. Exactly one context source**

| Field | Use when |
| --- | --- |
| `contextListJson` | Units map to path patterns in the repo |
| `getContextListFn` | Units come from a list you build (tickets, an API, a YAML folder) |
| `contextMatchFn` | You scan files and skip with code |

**2. Exactly one prompt definition**

| Field | Use when |
| --- | --- |
| `prompt` | A single agent pass |
| `steps` | Several passes, including plain commands with no LLM |

Both pairs are mutually exclusive. `lump-plan` is the error message if you set two, or none.

Minimal JSON:

```json .lumpcode/lumps/myLump/config.json
{
  "$schema": "https://lumpcode.com/schemas/lumpConfig.schema.json",
  "contextListJson": {
    "FILE": "src/{NAME}.ts"
  },
  "prompt": {
    "promptTemplate": "Improve types in @{FILE}.",
    "command": "cursor"
  }
}
```

`{NAME}` is captured from the real tree. `{FILE}` / `@{FILE}` in the prompt come from that match. Details: [contexts](/docs/author/contexts) and [prompts](/docs/author/prompts).

## Preview, then run

```bash
lumpcode lump-plan myLump
lumpcode lump-plan myLump --contexts --prompts
lumpcode run myLump
```

`lump-plan` loads config, discovers contexts, and can print resolved prompts. It does not run the agent or push. Fix what it reports, then run.

On your laptop, `project-setup` left `mode: "shared"`. The run happens in a copy. Open the pushed `lump/myLump/…` branch as a PR, merge, and the next run skips that context.

## Optional skill

`npx skills add lumpcode/skills` installs `/lumpcode` for the agent **in your editor**, so it can write and update lumps with current docs. That skill is not what runs inside a lump. The lump’s `command` is.

## What you can omit

CLI defaults you should not repeat unless you mean to change them:

- `numberOfContextsPerBranch: 1`
- `verbose` / `keepHistory` off
- `command` if `project.json` already sets a team default

`baseBranch` belongs on the lump only when this campaign should branch off something other than the project primary.

Next: [contexts](/docs/author/contexts), or skip ahead to [examples](/docs/reference/examples).
