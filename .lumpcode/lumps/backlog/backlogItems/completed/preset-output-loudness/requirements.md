# Requirements: Preset output loudness

| Field | Value |
| --- | --- |
| **Backlog** | `preset-output-loudness` · priority **2** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `live-step-transcripts` |
| **Packages** | `@lumpcode/cli` only (resolver, presets, sink call, docs). Core unchanged. The `presentOutput` factory and `onCommandOutput` hook already exist. |

## Problem statement and motivation

Ticket `live-step-transcripts` always presents the full session. Operators need a way to show less of an agent session without losing the raw output that history and retry use.

1. A full Cursor session in the terminal, or in a transcript, is more than some lumps want.
2. The knob has to match `model` and `agentPermissions`: lump default, step override.

## Goals

1. `outputDetail` on `lumpVariables` and `stepVariables` selects the session view.
2. Omitted means `loud` (assistant text and tool activity), the same view ticket 1 ships.
3. `quiet` keeps assistant text and drops tool activity from the live feed only.
4. Shipped agent presets honor it through one resolver. Custom modules may ignore it.

## Non-goals

- More levels than `loud` and `quiet`.
- Changing `commandResult`, history contents, or retry input.
- Filtering plain commands that have no `presentOutput`. Those stay raw at either setting.
- A CLI flag. The setting is lump and step variables only.

## User stories / use cases

1. As an author — I omit `outputDetail` and still see the full session.
2. As an author — I set `outputDetail: "quiet"` on the lump so transcripts show assistant text without tool activity, and a single step can set `loud` again.
3. As an author — a typo fails that command step with a message that names the bad value, instead of silently showing the full session.

## Proposed behavior and UX

### Variable

Key `outputDetail` on the existing `lumpVariables` / `stepVariables` bags (`Record<string, unknown>`). Not a new core type.

Resolution owner: `resolveOutputDetail({ lumpVariables, stepVariables })`, same pattern as `resolveAgentPermissions` (step wins, then lump).

| Input | Result |
| --- | --- |
| Both omitted | `'loud'` |
| Lump set, step omitted | Lump value |
| Step set | Step value |
| Value other than `'loud'` or `'quiet'` | Throw before spawn. Message includes the invalid value and the key name. |

The sink from `live-step-transcripts` calls this resolver once per step and passes the result into the presenter as `outputDetail`. It no longer hardcodes `'loud'`. Modules without `presentOutput` skip the resolver. Their chunks stay raw.

### What each level shows

| Level | Live feed |
| --- | --- |
| `loud` | Assistant text and tool activity (tool name and the file or command). |
| `quiet` | Assistant text only. No tool activity. |

Raw protocol frames stay omitted at both levels. `commandResult` stays the raw process output at both levels.

Shipped presets (`cursor`, `copilot`, `claude-code`, `codex`, `opencode`) read the argument inside the factory they already export. They do not read `stepVariables` / `lumpVariables` for this key themselves. The sink is the only caller of `resolveOutputDetail`.

## Technical approach

| Step | Owner | What changes |
| --- | --- | --- |
| 1 | `resolveOutputDetail` | Step-over-lump resolution and the invalid-value throw. |
| 2 | CLI sink | Pass the resolved level into the presenter. Remove the hardcoded `'loud'`. |
| 3 | Shipped presets | Honor `quiet` vs `loud` in the existing `presentOutput` factory. |
| 4 | Docs | Variable, default, and step override. |

Invalid values throw from `resolveOutputDetail` before `execBinary`. The step walk already treats a thrown `commandFn` as a step failure. The sink calls the resolver before spawn, on the `start` path, and a throw there fails that step the same way. Do not catch it and fall back to `loud`.

## Testing strategy

| Level | Where | Proves |
| --- | --- | --- |
| Unit | `resolveOutputDetail` unit test | Omitted → `loud`. Step overrides lump. Invalid value throws and the message names the value. |
| Unit | CLI sink test from `live-step-transcripts` | The level passed into the presenter is the resolved one. No presenter → resolver is not required and chunks stay raw. |
| Unit | Each shipped preset's presenter test | Same recorded fixture: `loud` includes a tool line, `quiet` does not, both include assistant text, neither includes the raw frame. |
| Unit | History / `commandResult` | Unchanged when `outputDetail` is `quiet`. |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/lump-config.md` | `outputDetail` on `lumpVariables` and `stepVariables`. Values `loud` (default) and `quiet`. Step wins. Affects the live feed only. |
| `packages/apps/cli/DOCS/concepts.md` | One sentence on the live feed's loudness, pointing at that field. |
| `packages/apps/website/content/docs/author/agents.md` | `outputDetail` next to `model` and `agentPermissions`. Step wins. |
| `packages/apps/website/content/docs/config/lump.md` | Same key on the `lumpVariables` row. |

Do not add the key to `lumpConfig.schema.json` as a top-level field. It lives inside the variable bags, like `model`.

## Acceptance criteria

1. Omitting `outputDetail` still shows assistant text and tool activity.
2. `outputDetail: "quiet"` on the lump drops tool activity from the terminal and from the transcript, and a step value of `loud` restores it for that step.
3. History and retry still receive the raw command output when the live feed is `quiet`.
4. An invalid `outputDetail` fails that step before the agent starts, and the error names the value.
5. A command module with no `presentOutput` is unaffected by the key.
6. Shipped presets do not resolve the key themselves. Only `resolveOutputDetail` does.
