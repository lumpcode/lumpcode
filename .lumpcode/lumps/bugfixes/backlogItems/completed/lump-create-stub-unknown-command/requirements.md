# Requirements: `lump-create` stub names a command tag that does not resolve

| Field | Value |
| --- | --- |
| **Backlog** | `lump-create-stub-unknown-command` · priority **20** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli` (`commands/lump-create`). `@lumpcode/core`, `@lumpcode/recipes`, and docs unchanged. |

## Problem statement and motivation

`lumpcode lump-create <lumpName>` writes a stub config from [`packages/apps/cli/src/commands/lump-create/main.ts`](../../../../../../packages/apps/cli/src/commands/lump-create/main.ts). All three stubs (`config.json`, `config.js`, `config.ts`) set `command: "claude"`. No shipped preset uses that tag. The shipped presets are `claude-code`, `codex`, `copilot`, `cursor`, `opencode` (`packages/apps/cli/src/presets/commands/`), and [Lump config](../../../../../../packages/apps/cli/DOCS/config/lump.md) and [Agents](../../../../../../packages/apps/cli/DOCS/author/agents.md) document `claude-code` as the Claude Code tag. The lump schema examples list the same tags.

1. A lump created with `lump-create` fails `lump-plan`, even with `--contexts` only, before it lists a single context.
2. `run` on that lump fails the same way.
3. The error points at `~/.lumpcode/commands/presets/claude.js`, which suggests a broken install rather than a wrong tag in the stub.

### Repro (run during bug hunt, built CLI, scratch `HOME` with `reset-presets`)

1. In a git repo with `origin`: `lumpcode project-setup --projectName tpl --mode shared --primaryBranch main`.
2. `lumpcode lump-create comps`.
3. `lumpcode lump-plan comps --contexts`.

| | Result |
| --- | --- |
| **Actual** | Exit 1: `Failed to load command module 'claude': Failed to import <HOME>/.lumpcode/commands/presets/claude.js, error: Error [ERR_MODULE_NOT_FOUND] …` |
| **Expected** | The stub loads. `lump-plan` reports `Lump "comps" is valid.` and lists the contexts its `contextListJson` finds (none is fine). |

Replacing `"claude"` with `"claude-code"` in the generated `config.json` makes the same command succeed.

## Goals

1. Every stub `lump-create` writes (`json`, `js`, `ts`) names a command tag that resolves to a shipped preset.
2. A test fails if a stub ever names an unresolvable tag again.

## Non-goals

- Detecting installed agents in `lump-create` (that is `setup`).
- Adding a `claude` alias preset.
- Changing the stub's `baseBranch`, `contextListJson`, or prompt.
- Changing the `claude` fixtures used by other unit tests.

## User stories / use cases

1. As an operator following [Write a lump](../../../../../../packages/apps/cli/DOCS/author/write-a-lump.md), I run `lump-create` then `lump-plan` and see a valid lump, so I can start editing from a working config.

## Proposed behavior and UX

No CLI syntax change. The stub's `command` becomes `claude-code` in all three formats. Output messages and the JSON envelope (`{ lumpName, configPath, configFormat }`) are unchanged.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/commands/lump-create/main.ts` | Set `command` to `claude-code` in the JSON stub and the JS/TS stub. |

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `packages/apps/cli/src/commands/lump-create/unit.test.ts` | For each format, the written stub's `command` is one of the shipped preset tags (names of `packages/apps/cli/src/presets/commands/*.js`). |
| Unit (optional) | same file | A `json` stub loaded through the existing lump config loader resolves its command module without error. |

## Acceptance criteria

1. The repro above ends with `Lump "comps" is valid.` and exit 0.
2. `lump-create --config js` and `--config ts` stubs name the same resolvable tag.
3. `npm run test -w=@lumpcode/cli` is green.
