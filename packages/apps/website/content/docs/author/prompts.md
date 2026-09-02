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

A `promptTemplate` that has **no whitespace** and ends in `.md`, `.txt`, `.template`, or `.prompt` is read as a file relative to the lump folder. Missing file fails at config load. Otherwise the string is inline text.

```json
{
  "prompt": {
    "promptTemplate": "Port @{COMPONENT} to Vue 3 and update @{TEST}.",
    "command": "cursor"
  }
}
```

`prompt` may also be a bare string (same template-or-file rules) or, in JS/TS, a `promptFn`.

## `steps`

Each item is a string, an object, or (JS/TS) a function that returns more items.

```json
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
| `command` | Agent tag or lump-relative `.ts` / `.js` module. Inherits top-level `command`. |
| `commandFn` | JS/TS only. Return `{ executable, args, env? }` or `null` to skip. Plain shell, not an LLM. |
| `stepVariables` | Preset options for this step (`model`, …). Step overrides lump. |
| `timeoutMillis` | Kill the process tree if the step overruns. |
| `continueOnError` | Default `false`. If `true`, a non-zero exit does not abort the context. |
| `postCommandExecFn` | After the command. May stash flags on `contextRunState` or **return more steps**. |

`promptTemplate` and `promptFn` cannot both be set on the same step. Use `promptFn` when the text includes raw command output that must not be scanned for `{VAR}`.

## A step does not have to be an agent

Two patterns:

1. Omit the prompt. The `command` runs with an empty string.
2. Give an inline `commandFn` in JS/TS for `npm test`, a compiler, anything on `PATH`.

That is how validation and retry work. `@lumpcode/recipes` exports `retryUntilGreen` so you do not hand-roll the loop. The idea: first steps do the edit, then a command runs; on failure, feed stdout back to the agent and try again; only the last attempt is allowed to fail the context.

```ts
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

If you write the loop yourself, `continueOnError: true` on retry attempts is what keeps a red suite from ending the context early. On the final attempt leave it false so a still-failing command skips commit and push; the context stays `toDo`.

Hand-rolled version: [examples, retry until green](/docs/reference/examples#retry-until-green).

## Dynamic steps

A `steps` item may be a function. Return an array, a solo item, or `[]` to skip.

```js
({ contextRunState }) =>
  contextRunState.needsDocs
    ? [{ promptTemplate: 'Add minimal module docs for @{FILE}.' }]
    : []
```

`postCommandExecFn` on a previous step is the usual place to set that flag from stdout. Nested items get `stepIndex` as an array (`[1, 0]`) instead of a number.

If a **different** command tag appears only inside a function return, list it in top-level `registerCommands` so setup still runs. The lump’s own `command` tag is pre-registered.

## History

`"keepHistory": true` appends each step’s prompt and output to `.lumpcode/lumps/<lumpName>/history/<contextName>.yaml`. `project-setup` gitignores that folder. Use it to debug locally; do not commit it. Agent output can contain secrets.

More hook detail: [advanced](/docs/config/advanced).
