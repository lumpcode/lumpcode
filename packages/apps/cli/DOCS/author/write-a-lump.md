# Write a lump

A lump needs two things: a way to find the units of work, and what to run on each one. Everything else is optional.

## Create the folder

```bash
lumpcode lump-create myLump               # config.json
lumpcode lump-create myLump --config ts   # config.ts
```

The CLI loads `config.ts`, `config.js`, or `config.json` from `.lumpcode/lumps/<lumpName>/` (TypeScript wins if several exist). Start in JSON. Switch to TypeScript when you need a function: a computed context list, a retry loop, a condition.

## The two required pieces

**1. One context source**, to find the units of work:

| Field | Use when |
| --- | --- |
| `contextListJson` | Units match path patterns (`src/components/{NAME}/index.tsx`), or you list them by hand |
| `getContextListFn` | Units come from somewhere else: ticket folders, an API, a YAML file |
| `contextMatchFn` | You scan every file and decide in code |

**2. One prompt definition**, for what to do with each unit:

| Field | Use when |
| --- | --- |
| `prompt` | One agent pass |
| `steps` | Several passes, or plain commands like `npm test` between them |

```json .lumpcode/lumps/myLump/config.json
{
  "$schema": "https://lumpcode.com/schemas/lumpConfig.schema.json",
  "contextListJson": {
    "FILE": "src/utils/{NAME}.ts"
  },
  "prompt": {
    "promptTemplate": "Add an explicit return type to every export in @{FILE}.",
    "command": "cursor"
  }
}
```

`{NAME}` is captured from real files. Each match is one context, and its variables fill `{FILE}` / `@{FILE}` in the prompt. `$schema` gives you autocomplete and validation in most editors. Details: [Contexts](contexts.md), [Prompts and steps](prompts.md), [Agents](agents.md).

The same lump in TypeScript:

```ts .lumpcode/lumps/myLump/config.ts
import { defineConfig } from '@lumpcode/cli-utils'

export default defineConfig({
  contextListJson: { FILE: 'src/utils/{NAME}.ts' },
  prompt: {
    promptTemplate: 'Add an explicit return type to every export in @{FILE}.',
    command: 'cursor',
  },
})
```

TypeScript lumps need the helper packages in the project, so a worker clone gets them too:

```bash
npm install --save-dev @lumpcode/cli-utils @lumpcode/recipes
```

## Preview, then run

```bash
lumpcode lump-plan myLump                        # validate
lumpcode lump-plan myLump --contexts --prompts   # what would run, with prompts
lumpcode run myLump
```

`lump-plan` never calls the agent or touches git. On a laptop, `run` edits your current branch; see [First PR](../start/first-pr.md#4-rehearse-on-this-branch).

## Leave out the defaults

Only write what you change. These are already the default:

- `numberOfContextsPerBranch: 1`
- `verbose`, `keepHistory`: off
- `command`, if `project.json` sets a team default
- `baseBranch`, unless this lump should land somewhere other than the primary branch

Next: copy a shape from the [examples](../examples/overview.md), or turn a folder of tickets into a lump with the [folder backlog](backlog.md).
