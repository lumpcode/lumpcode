# Prompts and steps

A step is an agent prompt, a plain command, or a function that decides what runs next. A lump has either one `prompt` or a list of `steps`.

## Templates

`{VAR}` is replaced with the context variable `VAR`. `@{VAR}` is the same with a leading `@`, for agents that read `@path` as "attach this file".

```json config.json
{
  "prompt": {
    "promptTemplate": "Port @{COMPONENT} to Vue 3 and update @{TEST}.",
    "command": "cursor"
  }
}
```

Only context variables are substituted. `lumpVariables` and `stepVariables` carry agent options (`model`, …) and hook inputs, not prompt text.

Long prompts belong in a file next to the config. A template that has no spaces, ends in `.md`, `.txt`, `.prompt`, or `.template`, and exists in the lump folder is read from disk:

```json config.json
{
  "prompt": { "promptTemplate": "port.md", "command": "cursor" }
}
```

`prompt` may also be a plain string (`"prompt": "Port @{COMPONENT} to Vue 3."`).

## Several steps

Steps run in order on the same context and the same branch. A string is a prompt; an object adds options.

```json config.json
{
  "command": "cursor",
  "steps": [
    "Read @{COMPONENT} and write a short plan to {NAME}-plan.md. No source changes.",
    "Following {NAME}-plan.md, port @{COMPONENT} to Vue 3. Keep behavior identical.",
    "Delete {NAME}-plan.md."
  ]
}
```

| Step field | Role |
| --- | --- |
| `promptTemplate` / `promptFn` | The prompt. Optional: omit it and the command runs with an empty prompt. |
| `command` | Agent tag, a lump-relative `.ts`/`.js` module, or (JS/TS) an inline function. Defaults to the lump `command`. |
| `commandFn` | JS/TS. Return `{ executable, args, env? }` to run any program, or nothing to skip. |
| `stepVariables` | Agent options for this step, like `model`. Override `lumpVariables`. |
| `timeoutMillis` | Kill the step if it runs too long. |
| `continueOnError` | Default `false`: a non-zero exit fails the context. |
| `postCommandExecFn` | Runs after the command. Can read the output, store flags, or **return more steps**. |

## Validate and retry

A step does not have to call an agent. Give it a `commandFn` and it runs your build, linter, or tests. That is how you stop bad output from ever becoming a branch.

`retryUntilGreen` from `@lumpcode/recipes` wraps the usual loop: run your steps, run the check, and on failure hand the output back to the agent and try again, up to a cap.

```ts config.ts
import { defineConfig } from '@lumpcode/cli-utils'
import { retryUntilGreen, shellCommand } from '@lumpcode/recipes'

export default defineConfig({
  command: 'cursor',
  contextListJson: { FILE: 'src/utils/{NAME}.ts' },
  postSetupWorkspaceCommand: 'npm ci',
  steps: retryUntilGreen({
    steps: [{ promptTemplate: 'Add an explicit return type to every export in @{FILE}.' }],
    validationCommandFn: () => shellCommand('npm run typecheck && npm test'),
    maxIterations: 3, // default 5
  }),
})
```

Retries get a default fix prompt with the command and its output. Pass `fixSteps` to write your own. If the check is still red after the last attempt, the context fails: no commit, no push, and it stays `toDo`. A branch only reaches your remote when the check passed. The hand-written version of this loop is in [Building blocks](../examples/building-blocks.md#retry-until-green-by-hand).

## Decide what runs next

A `steps` item can be a function (JS/TS). It receives the context and `contextRunState`, a plain object shared by every step of that context, and returns more steps or `[]`.

```ts config.ts
import { defineConfig, type StepFn } from '@lumpcode/cli-utils'

const maybeDocs: StepFn = ({ contextRunState }) =>
  contextRunState.needsDocs ? [{ promptTemplate: 'Add module docs to @{FILE}.' }] : []

export default defineConfig({
  command: 'cursor',
  contextListJson: { FILE: 'src/{NAME}.ts' },
  steps: [
    {
      promptTemplate: 'Does @{FILE} need module docs? Reply YES or NO only.',
      postCommandExecFn({ commandResult, contextRunState }) {
        contextRunState.needsDocs = commandResult.toUpperCase().includes('YES')
      },
    },
    maybeDocs,
  ],
})
```

Use `promptFn` instead of `promptTemplate` when the prompt includes raw output (it is not scanned for `{VAR}`):

```ts config.ts
{
  promptFn: ({ context, contextRunState }) =>
    `The last check said:\n${contextRunState.lastOutput}\n\nFix ${context.variables.FILE}.`,
}
```

If a step returned by a function uses a different agent tag than the lump `command`, list it in `registerCommands` so its setup still runs:

```ts config.ts
registerCommands: ['claude-code'],
steps: [
  { promptTemplate: 'Edit @{FILE}.' },
  () => [{ command: 'claude-code', promptTemplate: 'Review the diff for @{FILE}. Do not edit.' }],
]
```

## Keep a record

`"keepHistory": true` appends each step's prompt and output to `.lumpcode/lumps/<lumpName>/history/<contextName>.yaml` (gitignored). Live output while a run is going is covered in [Watch it work](../start/observe.md).

Hook order and failure behavior: [Advanced](../config/advanced.md). Signatures: [Types](../config/types.md).
