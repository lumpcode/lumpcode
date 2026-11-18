# Requirements: a step `command` may be a plain shell string

| Field | Value |
| --- | --- |
| **Backlog** | `command-as-shell-string` · priority **3** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/core` (`CommandFn` type, new `platformShellCommand` util, new `resolveCommandFnReturn` helper, `executeStepsForContextList`, `collectStepsForContext`). `@lumpcode/cli`: command ref classification, `jsConfigToRunLumpInput` resolver, `project.json` / `local.json` command schema, `refreshCommand` argv, lump schema descriptions, DOCS. `@lumpcode/recipes` and presets unchanged. |

## Problem statement and motivation

A step that only runs a project script (`npm run test`, `make lint`) has no direct spelling today. A lump `command` string is a registered tag or a lump-relative `.ts` / `.js` module path, and an inline [`CommandFn`](../../../../../../packages/core/src/types/CommandFn.ts) must return a `CommandDescriptor`. DOCS state it plainly: "Not a shell snippet."

1. Authors wrap every script in `{ executable: 'sh', args: ['-c', '…'] }` or import `shellCommand` from `@lumpcode/recipes` just to run one line.
2. JSON lump configs cannot run a script step at all without writing a command module file.
3. `command: 'npm run test'` today fails at load as an unknown tag, with an error that points at `registerCommands`, which is the wrong fix.

## Goals

1. In a lump config (JS, TS, or JSON), a `command` string that contains whitespace runs as a shell line in the workspace.
2. An inline `CommandFn` (and a command module's `command`) may return a string; any non-empty string return runs as a shell line.
3. A shell line runs through the same spawn path as a descriptor: timeout, abort, `onCommandOutput`, `keepHistory`, `postCommandExecFn`, and `continueOnError` behave identically.
4. One owner decides the platform shell argv, and one owner classifies a config `command` string.

## Non-goals

- Shell strings in other hooks and injectors (git command returns, `postSetupWorkspaceFn` / `postTeardownWorkspaceFn` `command`, workspace setup commands). That is qol `command-descriptor-or-string-returns`, which should reuse `platformShellCommand`.
- Changing nullish skip semantics. A nullish return still skips.
- In-process results (qol `command-fn-result-return`).
- Shell strings in `.lumpcode/project.json` / `local.json` `command`. That default stays a tag.
- Passing the step prompt to the shell line (no argv append, no env var).
- Changing `@lumpcode/recipes` `shellCommand` (it keeps `sh -c` on every platform).

## User stories / use cases

1. As a JSON lump author, I add a step `{ "command": "npm run test" }` after the agent step and the context fails when tests fail.
2. As a TS author, `command: ({ context }) => \`npm run lint -- ${context.variables.FILE}\`` runs without building a descriptor.
3. As an author using `continueOnError: true`, a failed `npm run test` step hands its output to `postCommandExecFn`, which returns a fix step.
4. As an operator, `lumpcode lump-plan --prompts` shows the shell argv for that step.

## Proposed behavior and UX

### Config `command` string classification

Owner: `classifyCommandRef(value: string) → 'file' | 'shell' | 'tag'` in `packages/apps/cli/src/utils/lumpConfigPathRef/main.ts`, next to `isCommandFileRef`. No other module re-derives this.

| Order | Rule | Kind |
| --- | --- | --- |
| 1 | `isCommandFileRef(value)` (no whitespace, ends in `.ts` / `.js`) | `file` |
| 2 | `value.trim()` contains whitespace | `shell` |
| 3 | otherwise | `tag` |

A single-word line such as `make` is a tag by this rule. Authors who want it as shell return it from an inline `CommandFn` (`() => 'make'`), where every string is shell. An empty or whitespace-only `command` string fails config load with `command must not be empty`.

Applies to top-level `command` and per-step `command` in lump configs, and to steps returned at run time by step functions and `postCommandExecFn`. A shell string needs no `registerCommands` entry, is never pre-registered, and never hits the "not registered" run-time error.

### `CommandFn` return

Contract in `packages/core/src/types/CommandFn.ts`: the return union gains `string`, so it becomes `MaybePromise<CommandDescriptor | string | null | undefined | void>` (plus `CommandFnResult` if `command-fn-result-return` lands first).

Owner: `resolveCommandFnReturn(value) → Success<CommandDescriptor | null> | Failure<string>` in `packages/core/src/helpers/resolveCommandFnReturn/`. Both `executeStepsForContextList` and `collectStepsForContext` call it, and neither checks `typeof === 'string'` itself. If `isCommandFnResult` exists, it runs first and this helper handles the rest.

| Return | Result |
| --- | --- |
| `CommandDescriptor` | unchanged |
| nullish | `null` (skip, unchanged) |
| non-empty string (after trim) | `platformShellCommand(value)` |
| empty or whitespace-only string | `Failure`: `commandFn returned an empty command string` |

In `executeStepsForContextList` the failure ends the walk with `reason: 'stepWalkFailed'`, writes no history, and skips `postCommandExecFn`, like a hard spawn failure. `collectStepsForContext` throws an `Error` with the same message, as it does for any throwing `commandFn`.

### Platform shell

Owner: `platformShellCommand(script: string, platform?: NodeJS.Platform) → CommandDescriptor` in `packages/core/src/utils/platformShellCommand/`, exported from `@lumpcode/core`. `platform` defaults to `process.platform`.

| Platform | `executable` | `args` |
| --- | --- | --- |
| `win32` | `cmd.exe` | `['/d', '/s', '/c', script]` |
| other | `/bin/sh` | `['-c', script]` |

This matches the argv `refreshCommand` uses today. The script string is passed as is, with no quoting or escaping added. `cwd` is the step `workspacePath`, the same as every step.

### CLI resolver

For a `shell` ref, `resolveCommandFn` in `jsConfigToRunLumpInput` returns a `CommandFn` that returns the string. It sets no `commandName`, loads no module, and runs no command-module `setup` / `teardown`.

`tagCommandSchema` in `projectLocalConfigSchema` rejects `shell` refs with: `command must be a registered tag (not a shell line); shell lines are only allowed in lump config`. File refs keep their current message.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/core/src/utils/platformShellCommand/` (`main.ts`, `index.ts`, `unit.test.ts`), `utils/index.ts` | New util per the platform table. |
| 2 | `packages/core/src/types/CommandFn.ts` | Add `string` to the return union. |
| 3 | `packages/core/src/helpers/resolveCommandFnReturn/` (`main.ts`, `index.ts`, `unit.test.ts`), `helpers/index.ts` | New helper per the return table. |
| 4 | `packages/core/src/helpers/executeStepsForContextList/main.ts` | Normalize the `commandFn` return through the helper before the spawn branch. History and logging use the normalized descriptor. |
| 5 | `packages/core/src/helpers/collectStepsForContext/main.ts` | Same normalization, so `CollectedStep.command` holds the shell descriptor. |
| 6 | `packages/apps/cli/src/utils/lumpConfigPathRef/main.ts` | Add `classifyCommandRef`. Keep `isCommandFileRef` exported. |
| 7 | `packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts` | `resolveCommandFn` and the pre-register tag list branch on `classifyCommandRef`. Fail load on an empty `command` string. |
| 8 | `packages/apps/cli/src/utils/projectLocalConfigSchema/main.ts` | `tagCommandSchema` rejects `shell` refs. |
| 9 | `packages/apps/cli/src/utils/discoverDedicatedLumpsForScanBranch/main.ts` | `refreshCommand` builds its argv with `platformShellCommand`. Behavior unchanged. |
| 10 | `packages/apps/cli/src/schemas/lumpConfig.schema.json` | Top-level and step `command` descriptions add the shell-line form and an `npm run test` example. Type stays `string`. |

`LumpJsConfigStep`, `LumpJsonConfigStep`, and `CommandTag` types stay as they are (all already `string`). `lump-plan` needs no change, because it prints `CollectedStep.command`.

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `packages/core/src/utils/platformShellCommand/unit.test.ts` | `win32` and `linux` argv. The script is passed through unchanged. |
| Unit | `packages/core/src/helpers/resolveCommandFnReturn/unit.test.ts` | Descriptor passthrough, nullish returns `null`, a string becomes the platform shell descriptor, and an empty or whitespace string fails. |
| Unit | `packages/core/src/helpers/executeStepsForContextList/testing/general.unit.test.ts` | A string-returning step spawns a real `/bin/sh -c` (skipped on Windows) and its stdout reaches `postCommandExecFn`. A failing shell line without `continueOnError` gives `stepWalkFailed`. With `continueOnError: true`, `commandSucceeded: false` and the walk continues. An empty string gives `stepWalkFailed`. A history entry is written when `keepHistory` is set. |
| Unit | `packages/core/src/helpers/collectStepsForContext/unit.test.ts` | A string return is collected as the platform shell descriptor. |
| Type | `packages/core/src/types/typedVariables.types.test.ts` | `CommandFn<V, SV>` returning a string compiles. |
| Unit | `packages/apps/cli/src/utils/lumpConfigPathRef/unit.test.ts` | `classifyCommandRef` returns `file` for `./a.ts`, `shell` for `npm run test`, `tag` for `cursor`, and `tag` for `make`. |
| Unit | `packages/apps/cli/src/utils/jsConfigToRunLumpInput/testing/promptCommandSteps.unit.test.ts` | A step `command: 'node -e "process.stdout.write(\'ok\')"'` runs end to end through `runLump` with no `registerCommands`. A shell string on a step returned at run time does not throw the "not registered" error. An empty `command` fails load. |
| Unit | Existing `projectLocalConfigSchema` coverage (in `readProjectLocalConfig` / `readLocalConfig` tests) | A `local.json` `command` of `npm run test` is rejected with the shell-line message. |
| Unit | `packages/apps/cli/src/utils/discoverDedicatedLumpsForScanBranch/unit.test.ts` | Still green. Update any assertion on the `refreshCommand` binary only if it changes shape. |

No E2E. The engine tests spawn a real shell.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/config/lump.md` | The `command` list gains a fourth form, **Shell line**: a string with whitespace that runs via `/bin/sh -c` (`cmd.exe /d /s /c` on Windows) in the workspace, with no prompt passed. Replace "Not a shell snippet." with the whitespace rule and the single-word note. Add `command: 'npm run test'` to the example. |
| `packages/apps/cli/DOCS/author/agents.md` | Same fourth form in the numbered list. The inline `CommandFn` item says a returned string runs as a shell line. Replace "is not a shell line" in the intro. |
| `packages/apps/cli/DOCS/config/types.md` | `CommandFn` return includes `string`, and the empty-string failure. |
| `packages/apps/cli/DOCS/config/project.md` (`command` row), `config/local.md` (lump defaults paragraph) | "Tag only, not a `.ts` path" becomes "tag only, not a `.ts` path or a shell line". |
| `packages/core/README.md` | `commandFn` row: may return a shell string, run via the platform shell. |

## Acceptance criteria

1. A JSON lump step `{ "command": "npm run test" }` runs the script in the workspace with no `registerCommands`, and a non-zero exit fails the context unless `continueOnError` is set.
2. An inline `CommandFn` returning `'echo hi'` produces `commandResult` containing `hi` in `postCommandExecFn` and one history entry when `keepHistory` is on.
3. An empty or whitespace-only string, as config `command` or `CommandFn` return, fails with the messages above.
4. `command: 'cursor'` and `command: './agent.ts'` resolve exactly as before.
5. `local.json` / `project.json` reject a shell-line `command`.
6. `lump-plan --prompts` shows `/bin/sh -c npm run test` (or the `cmd.exe` form on Windows) for a shell step.
7. String-to-descriptor conversion exists only in `resolveCommandFnReturn`, platform argv only in `platformShellCommand`, and config string classification only in `classifyCommandRef`.
8. `npm run test -w=@lumpcode/core`, `npm run build -w=@lumpcode/cli`, and `npm run test -w=@lumpcode/cli` are green.
