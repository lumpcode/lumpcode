# Requirements: `extraArgs` pass-through on shipped agent presets

| Field | Value |
| --- | --- |
| **Backlog** | `preset-effort-and-custom-args` · priority **2** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli` (`src/presets/commands/`). `@lumpcode/cli-utils` (preset variable types). `@lumpcode/core`, `@lumpcode/recipes`, `@lumpcode/cli-types`, and the lump config JSON schema unchanged. |

## Problem statement and motivation

The five shipped presets (`cursor`, `copilot`, `claude-code`, `opencode`, `codex` under `packages/apps/cli/src/presets/commands/`) build a fixed argv from `model` and `agentPermissions`. Any other harness flag (reasoning effort, max turns, a verbosity switch, a new flag a harness ships next week) needs a custom command module that copies the preset's session handling.

1. Operators who only want one extra flag must fork a preset and maintain it against later preset changes.
2. "Effort" is spelled differently in each harness and on Cursor is part of the model slug (for example `claude-opus-5-5-high`), so a single typed `effort` key would be a per-harness flag map Lumpcode has to keep current.
3. `lumpVariables` and `stepVariables` already carry preset options with "step overrides lump"; a pass-through list fits that model with no new config surface.

## Goals

1. Every shipped preset accepts `extraArgs: string[]` in `lumpVariables` and `stepVariables` and passes the list to the harness unchanged.
2. Step `extraArgs` replaces lump `extraArgs`, like `model` and `agentPermissions`.
3. Without `extraArgs`, every preset produces exactly today's argv.
4. Effort is reachable on every preset through `extraArgs` (or the model slug on Cursor), with no per-harness effort key.

## Non-goals

- A typed `effort` (or `reasoning`, `maxTurns`, …) key. Revisit as a separate item only if harness flags converge.
- Validating, deduplicating, or reordering flags against the harness. A flag that conflicts with a preset flag is passed as is; the harness decides.
- Shell-string splitting. `extraArgs` is an argv list, never a command line.
- Updating the test fixture copies under `src/utils/jsConfigToRunLumpInput/__fixtures__/global-config/commands/presets/`.
- Overwriting operators' installed presets. Existing installs keep their files until `lumpcode reset-presets`.

## User stories / use cases

1. As an operator on Codex, I set `lumpVariables: { extraArgs: ['-c', 'model_reasoning_effort=high'] }` so every step runs at high effort without a custom command module.
2. As an operator on Claude Code, I add a harness flag to one review step through `stepVariables.extraArgs` while other steps keep the lump list.
3. As an operator on Cursor, I pick effort through the model slug and use `extraArgs` only for other flags.

## Proposed behavior and UX

### Variables

| Key | Where | Type | Default | Merge |
| --- | --- | --- | --- | --- |
| `extraArgs` | `lumpVariables`, `stepVariables` | `string[]` | `[]` | Step list replaces lump list when the step sets it (including `[]` to clear). |

When the chosen value is present and not an array of strings, the preset `command` throws `extraArgs must be an array of strings` (same failure path as a missing chat id today).

### Placement in argv

| Preset | Position |
| --- | --- |
| `cursor` | After all preset args (after `--resume <chatId>`). |
| `copilot` | After all preset args (after `--session-id <chatId>`). |
| `claude-code` | After all preset args (after permission args). |
| `opencode` | After all preset args (after option args). |
| `codex` | After `resolveCodexArgs` output, before the `resume` subcommand, so they are `codex exec` options. |

### Types (`@lumpcode/cli-utils`)

New exported type `PresetExtraArgsVariables = { extraArgs?: readonly string[] }` in `cli-utils/src/presets/extraArgs.ts`. Each of the five `<Preset>PresetLumpVariables` types intersects it, so the matching `<Preset>PresetStepVariables` get it too. Barrel-exported from `cli-utils/src/presets/index.ts`.

### Shared preset util

```text
resolvePresetExtraArgs({ lumpVariables, stepVariables }) → string[]
```

File: `packages/apps/cli/src/presets/commands/utils/resolvePresetExtraArgs.js`. Owns the override rule and the type check. Preset modules call it and spread the result at the position above. No preset reads `extraArgs` directly.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `src/presets/commands/utils/resolvePresetExtraArgs.js` | New util with the contract above. |
| 2 | `src/presets/commands/{cursor,copilot,claude-code,opencode,codex}.js` | Call `resolvePresetExtraArgs` and spread the list at the documented position. No other argv change. |
| 3 | `cli-utils/src/presets/extraArgs.ts`, the five preset type files, `index.ts` | Add and export `PresetExtraArgsVariables`; intersect it into each lump variables type. |

New util files are copied into `~/.lumpcode/commands/presets/utils/` by `installPresetCommands` when missing; existing preset files are not overwritten, so operators run `lumpcode reset-presets` to get the new behavior.

## Testing strategy

### Unit

| Test | Covers |
| --- | --- |
| `src/presets/commands/utils/resolvePresetExtraArgs.unit.test.ts` (new) | Lump only, step only, step replaces lump, step `[]` clears lump, neither returns `[]`, non-array or non-string entry throws. |
| `src/presets/commands/extraArgs.unit.test.ts` (new) | For each of the five presets, call `command` with a `contextRunState` that already holds `<name>Setup.setupChatId` (no harness spawn): without `extraArgs` the argv equals today's argv; with lump `extraArgs` the list appears at the documented position; step override wins. Codex asserts the list sits before `resume`. |
| `cli-utils/src/presets/presetVariables.types.test.ts` | Add cases: `extraArgs: ['--x']` accepted on lump and step variables for all five presets; `extraArgs: '--x'` rejected. |

### E2E

None required. Existing preset E2E stays green because argv is unchanged without `extraArgs`.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/author/agents.md` (`model` and permissions) | Add `extraArgs`: list passed to the harness as is, step replaces lump, placement rule (Codex before `resume`), one example. One sentence: effort goes through `extraArgs`, or the model slug on Cursor. One sentence: run `lumpcode reset-presets` after upgrading if `extraArgs` is ignored. |
| `packages/apps/cli/DOCS/config/lump.md` (`lumpVariables` row) | Add `extraArgs` to the listed preset options. |

## Acceptance criteria

1. For each shipped preset, a lump with `lumpVariables.extraArgs: ['--flag', 'v']` produces argv with `--flag v` at the documented position, and the rest of argv is unchanged.
2. A step with `stepVariables.extraArgs` uses only the step list for that step.
3. With no `extraArgs`, each preset's argv is byte-for-byte today's argv.
4. A non-array or non-string-entry `extraArgs` fails the step with `extraArgs must be an array of strings`.
5. `CursorPresetLumpVariables` (and the other four) accept `extraArgs?: readonly string[]` and reject a string.
6. Only `resolvePresetExtraArgs` reads `extraArgs` from the variable bags; no preset module reads `lumpVariables.extraArgs` or `stepVariables.extraArgs` directly.
7. `agents.md` documents `extraArgs`, the placement rule, effort through `extraArgs`, and `reset-presets`.
8. `npm run build` and `npm run test -w=@lumpcode/cli` and `npm run test -w=@lumpcode/cli-utils` pass.
