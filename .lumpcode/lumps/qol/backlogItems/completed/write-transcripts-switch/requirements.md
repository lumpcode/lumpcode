# Requirements: Write transcripts switch

| Field | Value |
| --- | --- |
| **Backlog** | `write-transcripts-switch` · priority **0** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — (daemon transcripts already shipped) |
| **Packages** | `@lumpcode/cli` only. Core, recipes, and `lumpcode run` stdout are unchanged. |

## Problem statement and motivation

A daemon always writes `.lumpcode/lumps/<lumpName>/transcripts/<branch>/<stamp>.log`. There is no way to turn that file off for a machine or for one lump.

## Goals

1. Optional `writeTranscripts` on lump, `local.json`, and `project.json`.
2. Precedence **lump > local > project**. Only `undefined` inherits. `false` is kept.
3. Every layer omitted means **on** (today's daemon behavior).
4. `false` skips `prepareLumpTranscriptFile` so no transcript file is created for that lump line.

## Non-goals

- A CLI flag or a start-only override.
- Silencing `lumpcode run` stdout. That command still does not write a transcript file.
- Changing history, `commandResult`, presenters, or `logRetention`.
- Naming this `keepTranscripts` (reserved for committed markdown on `history-and-transcripts`).

## User stories / use cases

1. As an operator — I omit the field and worker ticks still write transcripts.
2. As an operator — I set `"writeTranscripts": false` in `local.json` so this machine writes none, unless a lump sets `true`.
3. As an author — I set `"writeTranscripts": false` on one lump so that lump writes no file even when the machine default is on.

## Proposed behavior and UX

Same overlay as `keepHistory`, inverted default.

| Effective value | Daemon lump line |
| --- | --- |
| omitted / `true` | Prepare the transcript file and pass `liveStepWrite` (today). |
| `false` | Do not call `prepareLumpTranscriptFile`. Leave `liveStepWrite` unset. |

Owner of the gate: `runLumpLine` in `packages/apps/cli/src/utils/launchStartDaemon/runForeground.ts`. Overlay with `applyLumpConfigDefaults` (already loaded there for `verbose`). If lump config fails to load, treat the lump as omitted and use frozen local/project. Do not duplicate the check in `jsConfigToRunLumpInput`.

Local/project changes need a worker restart (frozen at `start`). A lump config change is picked up on the next tick.

`lumpcode transcript` on a lump that wrote nothing behaves as today when no file exists.

## Technical approach

| Step | Where | What |
| --- | --- | --- |
| 1 | `sharedLumpDefaultFields`, `SHARED_KEYS`, `LUMP_DEFAULT_KEYS` | Add `writeTranscripts?: boolean` next to `keepHistory`. |
| 2 | Lump / local / project JSON schemas and `LumpJsConfig` | Optional boolean. Describe omit = on, lump > local > project. |
| 3 | `LocalJsonConfig` / `ProjectJsonConfig` Picks | Include the new key. |
| 4 | `runLumpLine` | Skip prepare when the overlaid value is `false`. |

No new util. Later `project-local-config-field-layers` picks this up because it sits on the same overlay lists as `keepHistory`.

## Testing strategy

| Level | Where | Proves |
| --- | --- | --- |
| Unit | `applyLumpConfigDefaults/unit.test.ts` | Inherit when lump omits. Lump `false` and lump `true` are kept. |
| Unit | Existing local/project read tests | Both files accept the boolean. Extend a `keepHistory` case rather than a new suite. |
| Unit | `commands/start/testing/` (spy on `runLumpFromLumpName`) | Overlaid `false`: no `liveStepWrite`. Omitted: `liveStepWrite` is passed. Lump `true` wins over local `false`. |
| Existing | `commands/run/unit.test.ts` | `run` still passes `liveStepWrite` to stdout and creates no transcript file. |

No new E2E.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/lump-config.md` | Field + overlay. Transcripts are gated on `writeTranscripts`, not `keepHistory`. Omit = on. |
| `packages/apps/cli/DOCS/local-config.md` | Row next to `keepHistory`. |
| `packages/apps/cli/DOCS/project-config.md` | Lump-defaults list includes `writeTranscripts`. |
| `packages/apps/cli/DOCS/concepts.md` | One sentence: off via `writeTranscripts: false`. |
| `packages/apps/website/content/docs/config/lump.md` | Same as CLI lump-config. |
| `packages/apps/website/content/docs/config/local.md` | Same as CLI local-config. |
| `packages/apps/website/content/docs/config/project.md` | Same as CLI project-config. |

## Acceptance criteria

1. Omit everywhere: daemon still writes a transcript file.
2. Lump, local, or project `false`: that lump line creates no file under `transcripts/`.
3. Lump `true` wins over local `false`. Lump `false` wins over local `true`.
4. `lumpcode run` still streams to stdout and still does not write a transcript file.
5. No `keepTranscripts` key. No core change.
