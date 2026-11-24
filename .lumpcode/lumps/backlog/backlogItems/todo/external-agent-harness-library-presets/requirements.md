# Requirements: External agent harness library presets

| Field | Value |
| --- | --- |
| **Backlog** | `external-agent-harness-library-presets` · priority **80** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | No package behavior changes. Shipped presets stay in `@lumpcode/cli` (`packages/apps/cli/src/presets/commands/`). Variable types stay in `@lumpcode/cli-utils`. `@lumpcode/core` `CommandFn` stays `{ executable, args, env? }`. `@cursor/sdk` stays the ideasToBacklog cloud dependency only. |

## Problem statement and motivation

Shipped presets build a headless argv by hand and return it from `command` for the engine to spawn. Vendor SDKs now exist for some of those agents. Replacing argv with an SDK is only an improvement when the SDK still runs that local preset and still accepts a string list of flags the preset does not know yet.

1. A typed SDK options object rejects or drops a flag added after this change. Lumps use `extraArgs` for that case, including effort on harnesses that have no model-slug form.
2. A library that wraps every CLI (`@pivanov/agents-wire`, `coding-agent-runner`, or another unifier) puts one unmaintained argv mapping in front of all five presets.
3. `@cursor/sdk` is already installed for the ideasToBacklog cloud agent. That does not by itself mean the local `cursor` preset can move.

## Goals

1. A shipped preset uses its vendor SDK for the local run only when that SDK can do the current preset's job and can pass the `extraArgs` string list through unchanged, including flags that do not exist yet.
2. Apply that gate to `cursor`, `copilot`, `claude-code`, `opencode`, and `codex`. Record, for any preset that moves, the SDK field that receives the strings.
3. Leave the operator-facing variables, session keys, loudness, and effort path as they are today.

## Non-goals

- `@pivanov/agents-wire`, `coding-agent-runner`, or any other third-party library whose job is to unify every agent CLI.
- ACP streaming, including `opencode acp`.
- `presets-typescript-package`. That item only changes how the current argv files are authored. This item does not convert `presets/commands/*.js` to TypeScript.
- An `effort` field on lump or step variables. Effort stays `extraArgs`, or a Cursor model slug such as `claude-opus-5-5-high`.
- Folding unknown flags into a typed map that rejects a new flag.
- Changing `model`, `agentPermissions`, `newChat`, `chatIdIndex`, or `outputDetail`.
- Pointing the local `cursor` preset at the ideasToBacklog cloud agent (`Agent.create({ cloud })`).
- Bumping `@cursor/sdk` or adding `@github/copilot-sdk`, `@anthropic-ai/claude-agent-sdk`, `@opencode/sdk`, or the Codex TypeScript SDK.

## User stories / use cases

1. As a lump author — I pass `extraArgs` for a flag the preset does not know, including one added after this change, and those strings still reach the same CLI invocation they reach today.
2. As a lump author — a step `extraArgs` list replaces the lump list, and `[]` clears it for that step.
3. As a lump author — `model` still comes from step, then lump. Cursor and Copilot still default to `auto`. Claude Code, OpenCode, and Codex still omit the model flag when `model` is unset.
4. As a lump author — `agentPermissions` stays the closed object for that preset, and `newChat` / `chatIdIndex` still pick the stored chat.
5. As a lump author — I set Cursor effort with a model slug, or another harness's effort with `extraArgs`, and there is no `effort` key to set.
6. As an operator of ideasToBacklog — the cloud agent still launches through `@cursor/sdk`. The local `cursor` preset still runs `cursor-agent`.

## Proposed behavior and UX

No new CLI command and no new variable. Authors keep `command: "cursor" | "copilot" | "claude-code" | "opencode" | "codex"` and the same `lumpVariables` / `stepVariables` bags.

### Move gate

A preset moves only when both are true:

1. The vendor SDK runs that preset's local job: headless, no user prompt, working directory `workspacePath`, the same session id `resolvePresetChatSession` already stores, the same model rule, the same `agentPermissions` behavior, and stdout the existing `presentOutput` factory already parses.
2. The SDK accepts the `extraArgs` string list as argv tokens, unchanged, in the position in the table below, including a token sequence that is not a flag this preset knows today.

When the SDK has no such field, that preset stays on its current argv. Mapping known flags onto typed options and dropping the rest fails the gate.

`resolvePresetExtraArgs({ lumpVariables, stepVariables })` stays the only owner of the list. Step wins when `stepVariables.extraArgs` is set, including `[]`. Missing on both sides yields `[]`. A value that is not an array of strings throws `extraArgs must be an array of strings` before spawn. Preset modules call that function. They do not read `extraArgs` themselves.

### Per preset

Checked against current vendor APIs (`@cursor/sdk` `AgentOptions` / `LocalAgentOptions` / `LocalSendOptions` through 1.4.2, the release on npm; this repo depends on `^1.0.27`). None pass the gate. No preset moves, so there is no SDK field that receives the strings.

| Preset | SDK slot that was checked | Decision |
| --- | --- | --- |
| `cursor` | `@cursor/sdk` local `Agent.create` / `Agent.resume` / `agent.send`. `LocalAgentOptions` and `LocalSendOptions` are typed objects (`cwd`, `sandboxOptions`, `settingSources`, and the other listed fields). The only `args?: string[]` is `McpServerConfig.args` for a stdio MCP server command. Local mode is an in-process agent loop. It does not spawn `cursor-agent`. | Stays on argv. A future flag such as `--header` or `--plugin-dir` has nowhere to go as a raw token. |
| `copilot` | `@github/copilot-sdk` `CopilotClientOptions.cliArgs?: string[]`, inserted before SDK-managed args on the long-lived CLI server process. | Stays on argv. Those strings are server-startup argv. The preset list stays on the per-step `copilot -p` invocation, after `--session-id`. The SDK session stream is a different protocol from the `--output-format json` lines `presentCopilotEvent` reads. |
| `claude-code` | `@anthropic-ai/claude-agent-sdk` `Options.extraArgs?: Record<string, string \| null>` (flag name without `--`, `null` for a boolean). The same SDK has a typed `effort` enum. | Stays on argv. The record folds tokens into a map. It does not accept the operator's string list (order, short flags, repeated flags, a token that is not `--name` / `--name value`). This item does not add `effort` and does not route effort through that enum. |
| `opencode` | `@opencode/sdk` `OpenCode.create()`, an in-process host. No public string-list field for CLI flags. | Stays on argv. |
| `codex` | Codex TypeScript SDK `CodexOptions.configOverrides?: string[]`, raw `--config key=value` overrides. | Stays on argv. That list is config overrides. It is not an arbitrary token list placed before `resume`. |

### Argv that stays

Whitespace-only `prompt` still returns null from `command` (no process). `setup` / `teardown` / `presentOutput` stay. Chat ids stay in `contextRunState["<commandName>Setup"]` via `resolvePresetChatSession` (`newChat`, `chatIdIndex`). `outputDetail` stays on the sink side (`resolveOutputDetail`); preset modules do not read it.

`model` is `stepVariables.model ?? lumpVariables.model`, then `auto` for `cursor` and `copilot` only. Claude Code, OpenCode, and Codex pass `--model` / `-m` only when that value is a non-empty string.

`agentPermissions` stays the closed object, resolved only by `resolveAgentPermissions` (step wins, then lump, then `{}`):

| Preset | Fields | Where they go |
| --- | --- | --- |
| `cursor` | `cursorConfigDir?` | `CURSOR_CONFIG_DIR` on `env` when set. Absolute path, or `projectRoot`-relative. Owner: `resolveCursorConfigDir`. |
| `copilot` | `writablePaths?`, `denyShell?` | `--allow-tool` / `--allow-all-tools` / `--deny-tool`. Defaults still deny `shell(git commit)` and `shell(git push)`. Owner: `resolveCopilotToolArgs`. |
| `claude-code` | `permissionMode?` (default `acceptEdits`), `allowedTools?`, `disallowedTools?`, `bare?`, `addDirs?` | Existing Claude flags. Defaults still deny `Bash(git commit *)` and `Bash(git push *)`. Owner: `resolveClaudeCodeArgs`. |
| `opencode` | `auto?` (default on), `agent?` | `--auto` unless `auto === false`; `--agent` when a non-empty string. Owner: `resolveOpenCodeArgs`. |
| `codex` | `sandbox?` (default `workspace-write`), `addDirs?`, `dangerouslyBypassApprovalsAndSandbox?` | `codex exec` options before `resume`. The bypass flag only when `true`. Owner: `resolveCodexArgs`. |

`extraArgs` is appended as its own tokens, after the preset's own arguments. Codex inserts the list after those exec options and before `resume`.

| Preset | `executable` | `args` order |
| --- | --- | --- |
| `cursor` | `cursor-agent` | `-p`, trimmed prompt, `--output-format`, `stream-json`, `--force`, `--trust`, `--workspace`, `workspacePath`, `--sandbox`, `enabled`, `--model`, model, `--resume`, chat id, then `extraArgs`. `env.CURSOR_CONFIG_DIR` when `cursorConfigDir` is set. |
| `copilot` | `copilot` | `-p`, trimmed prompt, `--output-format`, `json`, `--no-ask-user`, permission args, `--model`, model, `--session-id`, chat id, then `extraArgs`. |
| `claude-code` | `claude` | `-p`, trimmed prompt, `--output-format`, `stream-json`, `--verbose`, `--session-id`, chat id, permission args (model flag inside those args when set), then `extraArgs`. |
| `opencode` | `opencode` | `run`, `--format`, `json`, trimmed prompt, `-s`, chat id, option args (model flag inside those args when set), then `extraArgs`. |
| `codex` | `codex` | `exec`, option args (`--json`, sandbox, add-dirs, model when set, bypass when `true`), then `extraArgs`, then `resume`, chat id, trimmed prompt. |

Chat creation stays where it is: `cursor-agent create-chat` for Cursor; `randomUUID` for Copilot and Claude Code; `createCodexSession` / `createOpenCodeSession` for Codex and OpenCode (Codex session creation still uses `execFileIgnoreStdin`). Codex `extraArgs` apply to the `exec` … `resume` invocation. They are not required on session creation.

Installed preset files stay plain ESM under `packages/apps/cli/src/presets/commands/`: Node builtins and relative `./utils/` only. `installPresetCommands` still copies them to `~/.lumpcode/commands/presets/`. They do not import `@lumpcode/core` or a vendor SDK.

## Technical approach

| Step | Owner | What changes |
| --- | --- | --- |
| 1 | Each `presets/commands/<name>.js` `command` | Stays the argv in the table. No SDK call. No second argv builder. |
| 2 | `resolvePresetExtraArgs` | Stays the only reader of the `extraArgs` key and the only throw for a bad list. |
| 3 | `resolveAgentPermissions`, `resolvePresetChatSession`, `resolveCursorConfigDir`, `resolveCopilotToolArgs`, `resolveClaudeCodeArgs`, `resolveOpenCodeArgs`, `resolveCodexArgs` | Stay the owners of permissions, session id, and the preset's own flags. |
| 4 | `@lumpcode/cli-utils` preset types | `extraArgs?: readonly string[]` stays on `PresetExtraArgsVariables`. No `effort` field. `agentPermissions` objects stay closed. `newChat` and `chatIdIndex` stay step-only. |
| 5 | `@lumpcode/core` `CommandFn` | Return stays `CommandDescriptor \| null \| undefined \| void`. No in-process runner. |
| 6 | `launchIdeasCloudAgent.ts` | Keeps `Agent.create({ cloud })` for ideasToBacklog. The local preset does not call `@cursor/sdk`. |
| 7 | Dependencies | No new dependency. `@cursor/sdk` stays at its current range. |

A later item may move one preset when that vendor ships a string-list field that meets the gate, including placement before `resume` for Codex. That item names the field. This item does not add a shim that parses `extraArgs` into SDK options.

## Docs updates

No document changes. `packages/apps/cli/DOCS/author/agents.md` and the `lumpVariables` row in `packages/apps/cli/DOCS/config/lump.md` already describe `extraArgs`, the Codex-before-`resume` placement, the model defaults, and effort via `extraArgs` or a Cursor model slug.

## Acceptance criteria

1. `cursor`, `copilot`, `claude-code`, `opencode`, and `codex` still return the argv in the table, including `extraArgs` at the listed position. Codex still places the list before `resume`.
2. A step `extraArgs` list replaces the lump list. `[]` adds no tokens. A non-array or a non-string entry still fails that step with `extraArgs must be an array of strings` before the agent starts.
3. `model`, `agentPermissions`, `newChat`, `chatIdIndex`, and `outputDetail` behave as they do today. There is no `effort` field.
4. Preset command files do not import `@cursor/sdk`, `@github/copilot-sdk`, `@anthropic-ai/claude-agent-sdk`, `@opencode/sdk`, the Codex SDK, `@pivanov/agents-wire`, or `coding-agent-runner`.
5. `package.json` gains none of those packages. The existing `@cursor/sdk` range is unchanged, and ideasToBacklog still uses it for the cloud agent only.
6. `resolvePresetExtraArgs` remains the only function that reads the `extraArgs` variable. The permission and session helpers named above remain the only owners of those flags and chat ids.
7. Operator docs listed above are unchanged.
