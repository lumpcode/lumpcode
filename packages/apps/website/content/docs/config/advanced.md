---
title: Advanced
description: Hooks, dynamic steps, and custom command modules. Read write a lump first; this page is the parts that need code.
---

Every `*Fn` is an inline function in `config.js` / `config.ts`, or a string path to a module whose default export is that function. Paths are relative to the lump folder.

## When hooks run

After Lumpcode has a todo list and a branch workspace:

1. `postSetupWorkspaceFn` / `postSetupWorkspaceCommand` once (for example `npm ci`).
2. For each context: lump `setupFn`, then each command module `setup`.
3. Walk `steps` / `prompt`. Each leaf: resolve prompt → run command → `postCommandExecFn` (may return more steps).
4. Command module `teardown`, then lump `teardownFn`.
5. Marker `git add` + commit. Next context, or push.
6. `postTeardownWorkspaceFn` / `Command`, then generated workspace teardown.

Teardown still runs if the step walk fails. A failed walk skips git for that context, the remaining contexts, and push. Teardown errors are logged and do not become the run failure.

`lump-plan` does not run post-setup / post-teardown commands. `--prompts` / `--plan` may execute `promptFn` and dynamic `steps` so the preview is honest; they still do not spawn the agent or mutate git.

## `contextRunState`

One mutable object per context run. The engine never clones it. Typical uses:

| Stage | Convention |
| --- | --- |
| `setupFn` | Seed `{ contextRunState: { … } }`. |
| Command `setup` | Namespaced at `<commandName>Setup` (session ids). |
| `postCommandExecFn` | Parse stdout, set flags, or return follow-on steps. |
| Dynamic `steps` | Read flags to include or skip the next prompt. |

## Discovery hooks

Covered with examples on [contexts](/docs/author/contexts). Short gotchas:

- `getContextListFn` variable values must be strings.
- `contextMatchFn` merges rows that share `contextName`.
- `contextOptionsFn` runs only with `contextListJson`.

## Dynamic `steps`

A function item receives the same inputs as `promptFn` (without `stepVariables`) and returns more steps, a solo item, or `[]`.

```js
export default {
  command: 'cursor',
  contextListJson: { FILE: 'src/{NAME}.ts' },
  steps: [
    {
      promptTemplate: 'Does @{FILE} need a README section? Reply YES or NO only.',
      postCommandExecFn({ commandResult, contextRunState }) {
        contextRunState.needsDocs = commandResult.toUpperCase().includes('YES')
      },
    },
    ({ contextRunState }) =>
      contextRunState.needsDocs
        ? [{ promptTemplate: 'Add minimal module docs for @{FILE}.' }]
        : [],
  ],
}
```

`postCommandExecFn` may itself return the next iteration of a verify loop. Prefer `retryUntilGreen` from [@lumpcode/recipes](/docs/author/recipes) unless you need a custom shape.

If a command tag other than the lump `command` appears only inside a returned array, set `"registerCommands": ["other-agent"]` so that module’s `setup` still runs.

## Custom commands

See [agents](/docs/author/agents) for presets and a minimal module. Order of `setup`: lump `setupFn`, then each command `setup`. Teardown is the reverse.

## `promptFn`

Use when the prompt must include previous stdout or branch on `contextRunState`. Mutually exclusive with `promptTemplate` on that step. `promptFn` is not scanned for `{VAR}`; concatenate `context.variables` yourself if you need them.

## Failure modes worth knowing

| What happened | Result |
| --- | --- |
| Step walk failed or aborted | No git for that context, no further contexts, no push. `reason: stepWalkFailed`. |
| `gitAddCommitFn` failed / empty string / throw | Hard fail, remaining contexts skipped. |
| Only workspace teardown failed | `workspaceTeardownFailed` unless a walk/commit failure was already recorded. |
| `git push` failed | Logged; not a hard fail. |

Ctrl+C on a manual `run`: first signal aborts, second force-exits. A worker mid-run refuses a graceful `stop` until you pass `--force` or wait for idle.
