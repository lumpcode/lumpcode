---
title: Prompts and steps
description: A step can be an agent prompt, a plain command, or a function that decides what runs next. Gate work on your own tests.
---

A runnable lump needs `prompt` or `steps`, not both.

## Template syntax

In `promptTemplate` (and string prompts) only braced placeholders are substituted, and only from **context** variables:

- `{VAR}` — the literal string in `context.variables.VAR`
- `@{VAR}` — the same, with a leading `@`, for agents that treat `@path` as file context

Lump-level `lumpVariables` and per-step `stepVariables` are **not** interpolated here. Those bags are for preset options (`model`, `agentPermissions`) and hooks.

Inline text:

```json config.json
{
  "prompt": {
    "promptTemplate": "Port @{COMPONENT} to Vue 3 and update @{TEST}.",
    "command": "cursor"
  }
}
```

`prompt` may also be a bare string (same template-or-file rules) or, in JS/TS, a `promptFn`.

```json config.json
{
  "prompt": "Port @{COMPONENT} to Vue 3."
}
```

A file template is a string with **no whitespace** that ends in `.md`, `.txt`, `.template`, or `.prompt` and exists under the lump folder:

```json config.json
{
  "prompt": {
    "promptTemplate": "port.md",
    "command": "cursor"
  }
}
```

`promptFn` when the text must include raw stdout (not scanned for `{VAR}`):

```ts config.ts
{
  promptFn({ context, contextRunState }) {
    return `Last output:\n${contextRunState.lastOutput}\n\nEdit ${context.variables.FILE}.`
  },
}
```

## `steps`

Each item is a string, an object, or (JS/TS) a function that returns more items.

```json config.json
{
  "command": "cursor",
  "steps": [
    "Read @{COMPONENT} and write a short plan to {NAME}-plan.md. No source changes.",
    "Following {NAME}-plan.md, port @{COMPONENT} to Vue 3. Keep behavior identical."
  ]
}
```

In `config.ts` / `config.js`, `steps` may be a single item instead of an array. JSON must use an array.

### Per-step object

| Field | Role |
| --- | --- |
| `promptTemplate` / `promptFn` | Optional. Omit both and the command still runs with an empty prompt. |
| `command` | Tag, lump-relative `.ts` / `.js` module, or (JS/TS) an inline `CommandFn`. Inherits top-level `command`. |
| `commandFn` | JS/TS only. Same contract as inline `command`: `{ executable, args, env? }`, or `null` / `undefined` / nothing to skip. |
| `stepVariables` | Preset options for this step (`model`, …). Step overrides lump. |
| `timeoutMillis` | Kill the process tree if the step overruns. |
| `continueOnError` | Default `false`. If `true`, a non-zero exit does not abort the context. |
| `postCommandExecFn` | After the command. May stash flags on `contextRunState` or **return more steps**. |

`promptTemplate` and `promptFn` cannot both be set on the same step. Use `promptFn` when the text includes raw command output that must not be scanned for `{VAR}`.

```ts config.ts
{
  promptTemplate: 'Port @{COMPONENT} to Vue 3.',
  command: 'cursor',
  timeoutMillis: 600_000,
  continueOnError: false,
  stepVariables: { model: 'auto' },
}
```

## A step does not have to be an agent

Two patterns:

1. Omit the prompt. The `command` runs with an empty string.
2. Give an inline `command` or `commandFn` in JS/TS for `npm test`, a compiler, anything on `PATH`. Skip by returning nothing: no process, `postCommandExecFn` still runs, no history row.

```ts config.ts
{
  commandFn: () => ({ executable: 'npm', args: ['test'] }),
}

{
  commandFn: () => undefined,
}
```

That is how validation and retry work. `@lumpcode/recipes` exports `retryUntilGreen` so you do not hand-roll the loop. First steps do the edit, then a command runs; on failure, feed stdout back to the agent and try again. Only the last attempt may fail the context.

```ts config.ts
import { defineConfig } from '@lumpcode/cli-utils'
import { retryUntilGreen } from '@lumpcode/recipes'

export default defineConfig({
  contextListJson: { FILE: 'src/utils/{NAME}.ts' },
  command: 'cursor',
  postSetupWorkspaceCommand: 'npm ci',
  steps: retryUntilGreen({
    steps: [
      { promptTemplate: 'Add an explicit return type to every export in @{FILE}.' },
    ],
    validationCommandFn: () => ({ executable: 'npm', args: ['test'] }),
  }),
})
```

Under the hood there is no special engine mode. Each node is a `StepFn`. `postCommandExecFn` calls the next node with the same `input`:

```ts config.ts
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
  steps: edit,
})
```

`edit` returns `[prompt, test]`. `test` calls `done(input)` or `fix(input)`. `fix` returns `[prompt, test]`. `continueOnError: true` lets a red suite take the `fix` branch instead of ending the context. This retries until green. `retryUntilGreen` adds the attempt cap so the last failure stays `toDo`.

Same loop, copy-paste ready: [examples, retry until green](/docs/reference/examples#retry-until-green).

## Dynamic steps

A `steps` item may be a `StepFn`. Return an array, a solo item, or `[]` to skip. A solo `steps: fn` is valid in JS/TS.

```ts config.ts
import { defineConfig, type StepFn } from '@lumpcode/cli-utils'

const maybeDocs: StepFn = ({ contextRunState }) =>
  contextRunState.needsDocs
    ? [{ promptTemplate: 'Add minimal module docs for @{FILE}.' }]
    : []

export default defineConfig({
  command: 'cursor',
  contextListJson: { FILE: 'src/{NAME}.ts' },
  steps: [
    {
      promptTemplate: 'Does @{FILE} need a README section? Reply YES or NO only.',
      postCommandExecFn({ commandResult, contextRunState }) {
        contextRunState.needsDocs = commandResult.toUpperCase().includes('YES')
      },
    },
    maybeDocs,
  ],
})
```

First step sets a flag from stdout. `maybeDocs` then returns one prompt or `[]`. Nested items get `stepIndex` as an array (`[1, 0]`) instead of a number.

If a **different** command tag appears only inside a function return, list it in top-level `registerCommands` so setup still runs. The lump’s own `command` tag is pre-registered.

```ts config.ts
import { defineConfig } from '@lumpcode/cli-utils'

export default defineConfig({
  command: 'cursor',
  registerCommands: ['reviewer'],
  contextListJson: { FILE: 'src/{NAME}.ts' },
  steps: [
    { promptTemplate: 'Edit @{FILE}.' },
    () => [{ command: 'reviewer', promptTemplate: 'Review @{FILE}. Do not edit.' }],
  ],
})
```

## History

`"keepHistory": true` appends each step’s prompt and output to `.lumpcode/lumps/<lumpName>/history/<contextName>.yaml`. Skipped `commandFn` writes no row. Entry shape: [lump config](/docs/config/lump#history). Do not commit it.

```json config.json
{
  "keepHistory": true
}
```

More hook detail: [advanced](/docs/config/advanced). Signatures: [types](/docs/config/types).
