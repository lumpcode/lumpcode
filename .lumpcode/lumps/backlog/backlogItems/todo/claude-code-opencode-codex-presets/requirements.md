# Requirements: Claude Code, OpenCode, and Codex presets

| Field | Value |
| --- | --- |
| **Backlog** | `claude-code-opencode-codex-presets` · priority **2** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `@lumpcode/cli` (preset modules + DOCS/schema). Types: `@lumpcode/cli-utils`. Unchanged: `@lumpcode/core`, `@lumpcode/recipes`, `@lumpcode/cli-types` |

## Problem statement and motivation

Lumpcode ships built-in headless presets only for **`cursor`** and **`copilot`**. Operators who use Claude Code, OpenCode, or Codex must write custom command modules, even though the desired shape (headless, resumable sessions, `model` / `agentPermissions`, whitespace → skip) already exists.

1. Docs and schema still present “cursor and copilot” as the only out-of-the-box agents; `registerCommands` examples already mention `claude-code` without a shipped preset.
2. Each agent’s session API differs (client UUID vs create-and-parse), so operators reinvent fragile wrappers.
3. No publishable TypeScript contracts for these agents’ `lumpVariables` / `stepVariables` on `@lumpcode/cli-utils`.

## Goals

1. Ship preset command modules for tags **`claude-code`**, **`opencode`**, and **`codex`**, same behavioral shape as cursor/copilot (headless, resumable `contextRunState`, step overrides lump for `model` / `agentPermissions`, whitespace-only prompt → `null`).
2. Install via existing `ensurePresetCommandsInstalled` / `reset-presets` (no new install API).
3. Export closed preset variable / permission types from `@lumpcode/cli-utils` and barrel them like cursor/copilot.
4. Document registered tags, PATH binaries, headless flags, and permissions alongside cursor/copilot in CLI DOCS and schema examples.

## Non-goals

- Core engine changes (`runLump`, step walk, session capture from command stdout).
- E2E or integration tests that spawn real `claude` / `opencode` / `codex` binaries.
- Changing cursor or copilot preset behavior.
- New CLI subcommands or flags.
- Zod/runtime validation of `agentPermissions` shapes.
- Model-name mapping / translation between agents.
- Per-command git denies for OpenCode/Codex via invented CLI knobs (document operator config instead).
- Dedicated unit tests for preset `.js` bodies beyond the cursor/copilot test surface.

## User stories / use cases

1. As an operator — I set `"command": "claude-code"` (or `opencode` / `codex`) with the agent on `PATH`, so the lump runs headless without a custom module.
2. As an operator — I set `lumpVariables.model` / `agentPermissions` and override per step, so analysis vs edit steps can differ.
3. As an operator — multi-step contexts resume the same agent session (`newChat` / `chatIdIndex` work like cursor/copilot).
4. As a TypeScript author — I parameterize `defineConfig` with the new preset types from `@lumpcode/cli-utils`, so invalid keys fail at compile time.
5. As a maintainer — `reset-presets` / first-run install pick up the three new files automatically.

## Proposed behavior and UX

### Registered tags and binaries

| Preset tag (`command`) | PATH binary | Default `model` |
| --- | --- | --- |
| `claude-code` | `claude` | `'auto'` (always pass `--model`) |
| `opencode` | `opencode` | omit `-m` when unset; pass operator value unchanged (`provider/model`) |
| `codex` | `codex` | `'auto'` (always pass `--model`) |

Config usage (unchanged resolution order: project → global → presets):

```json
{ "command": "claude-code" }
```

### Shared session / skip contract

| Item | Contract |
| --- | --- |
| State key | `contextRunState['<tag>Setup']` → `claude-codeSetup` \| `opencodeSetup` \| `codexSetup` |
| State shape | `{ setupChatId: string, chatsIds: Record<string, string> }` |
| Step-only vars | `PresetSessionStepVariables`: `newChat?`, `chatIdIndex?` (same semantics as cursor/copilot) |
| `chatKey` | `Array.isArray(stepIndex) ? stepIndex.join('.') : String(stepIndex)` |
| Empty prompt | `(prompt ?? '').trim()` empty → `command` returns `null` |
| `teardown` | no-op |
| Spawn cwd | Engine already uses `workspacePath`; presets do not pass redundant `--dir` / `-C` |

### Session bootstrap

| Preset | `setup` / `newChat` | Later turns |
| --- | --- | --- |
| `claude-code` | `randomUUID()` (no CLI) | `--session-id <id>` on every invocation |
| `opencode` | Headless create + parse session id (`execAsync`, like `cursor-agent create-chat`) | `opencode run … -s <id>` |
| `codex` | Headless create + parse `thread_id` | `codex exec resume <id> <prompt>` |

**Codex create:** `codex exec --json --sandbox workspace-write --model <resolved> <bootstrapPrompt>` → parse JSONL for first event `type === 'thread.started'` → `thread_id`. Missing id → throw.

**OpenCode create:** `opencode run --format json --title lumpcode --auto <bootstrapPrompt>` (add `-m` only if model set) → extract non-empty session id from JSON/JSONL stdout (field chosen from agent docs at implement time). Missing id → throw.

**Bootstrap prompt:** fixed constant, e.g. `Respond with OK only.`

### Always-on headless argv

**`claude-code` → `CommandDescriptor`**

```
executable: 'claude'
args: [
  '-p', trimmedPrompt,
  '--session-id', chatId,
  '--model', model,                 // default 'auto'
  '--permission-mode', mode,        // default 'acceptEdits'; overridable
  ...--disallowedTools for built-in git denies + user disallowedTools,
  ...optional --allowedTools / --bare / --add-dir from agentPermissions
]
```

Built-in git denies (always merged; operators cannot remove in v1): Claude permission rules denying agent `git commit` and `git push` (same intent as copilot’s `shell(git commit)` / `shell(git push)`). Exact rule strings follow Claude `--disallowedTools` syntax (e.g. `Bash(git commit *)`, `Bash(git push *)`).

**`opencode` → `CommandDescriptor`**

```
executable: 'opencode'
args: [
  'run', trimmedPrompt,
  '-s', chatId,
  ...('-m', model)?,                // omit when model unset
  ...('--auto')?,                   // default on; omit when agentPermissions.auto === false
  ...('--agent', agent)?
]
```

**`codex` → `CommandDescriptor`**

```
executable: 'codex'
args: [
  'exec', 'resume', chatId, trimmedPrompt,
  '--model', model,                 // default 'auto'
  '--sandbox', sandbox,             // default 'workspace-write'
  ...optional --add-dir,
  ...optional --dangerously-bypass-approvals-and-sandbox when explicitly true
]
```

Never imply `--dangerously-bypass-approvals-and-sandbox`. Do not use deprecated `--full-auto` as the default.

### `agentPermissions` TypeScript contracts (`@lumpcode/cli-utils`)

```ts
type ClaudeCodeAgentPermissions = {
  permissionMode?:
    | 'default' | 'acceptEdits' | 'plan' | 'auto' | 'dontAsk' | 'bypassPermissions'
  allowedTools?: readonly string[]
  disallowedTools?: readonly string[]
  bare?: boolean
  addDirs?: readonly string[]
}

type OpenCodeAgentPermissions = {
  auto?: boolean
  agent?: string
}

type CodexAgentPermissions = {
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
  dangerouslyBypassApprovalsAndSandbox?: boolean
  addDirs?: readonly string[]
}

type ClaudeCodePresetLumpVariables = {
  model?: string
  agentPermissions?: ClaudeCodeAgentPermissions
}
type OpenCodePresetLumpVariables = {
  model?: string
  agentPermissions?: OpenCodeAgentPermissions
}
type CodexPresetLumpVariables = {
  model?: string
  agentPermissions?: CodexAgentPermissions
}

type ClaudeCodePresetStepVariables =
  ClaudeCodePresetLumpVariables & PresetSessionStepVariables
type OpenCodePresetStepVariables =
  OpenCodePresetLumpVariables & PresetSessionStepVariables
type CodexPresetStepVariables =
  CodexPresetLumpVariables & PresetSessionStepVariables
```

Resolution: `stepVariables.agentPermissions ?? lumpVariables.agentPermissions ?? {}`; `stepVariables.model ?? lumpVariables.model ?? <default above>`. Closed shapes (no index signature); extend with `& Extra` at call sites.

**OpenCode / Codex git:** no built-in deny flags in the shipped argv. Docs state Lumpcode owns marker commits; operators deny git write in agent config.

### Install

New files under `packages/apps/cli/src/presets/commands/`:

| Path | Role |
| --- | --- |
| `claude-code.js` | preset module |
| `opencode.js` | preset module |
| `codex.js` | preset module |
| `utils/*` (as needed) | plain ESM helpers (permission/argv/session parse), same constraints as existing preset utils |

Constraints match existing presets: plain ESM; Node builtins + relative `./utils/` only; no `@lumpcode/core` imports; header comment `// PRESET COMMAND : DO NOT MODIFY THIS FILE`.

`ensurePresetCommandsInstalled` / `reset-presets` / build copy of `presets/commands/` pick them up by directory listing. First-run copy does not overwrite; `reset-presets` overwrites.

## Technical approach

| Step | Where | Contract change |
| --- | --- | --- |
| 1 | `cli-utils/src/presets/` | Add type modules + barrel exports for the nine new names (+ reuse `PresetSessionStepVariables`). |
| 2 | `cli/src/presets/commands/` | Implement three preset modules + shared/utils helpers for permissions, argv, and OpenCode/Codex session create/parse. |
| 3 | Fixtures | Mirror new presets (and utils if required) under `jsConfigToRunLumpInput/__fixtures__/global-config/commands/presets/` when install/resolution tests assert file sets. |
| 4 | `lumpConfig.schema.json` | `command` / related examples include `claude-code`, `opencode`, `codex` alongside `cursor` / `copilot`. |
| 5 | CLI DOCS | Preset tables, permissions, get-started / lump-config wording, types.md preset contract row. |
| 6 | Tests | Same surface as cursor/copilot (see below). |

## Testing strategy

Match cursor/copilot coverage only.

| Level | Coverage |
| --- | --- |
| **Unit (cli-utils)** | Extend `presetVariables.types.test.ts` for the new closed contracts (exact keys, `& Extra`, reject excess keys), same style as P1–P12 for cursor/copilot. |
| **Unit (install)** | `ensurePresetCommandsInstalled` / `listBundledPresetCommandNames` expectations include the three new top-level preset names; utils remain non-listed as command names. |
| **Indirect** | Existing `getCommandPath` / bundle-asset tests continue to work; update only if they hard-code the preset file set. |

**Update existing:** any test that asserts the bundled preset name list or fixture directory contents.

**Not required:** unit tests of preset `.js` command bodies; live-agent E2E; mocking `claude`/`opencode`/`codex` in integration tests.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/advanced-config.md` | Preset name/binary/model table; headless flags + permissions rows for the three agents; `agentPermissions` examples; note OpenCode/Codex git ownership via operator config. |
| `packages/apps/cli/DOCS/get-started.md` | Built-in preset list includes the three tags and PATH binaries. |
| `packages/apps/cli/DOCS/lump-config.md` | Registered-tag examples / preset wording. |
| `packages/apps/cli/DOCS/types.md` | Preset contracts row lists the new exported type names. |
| `packages/apps/cli/src/schemas/lumpConfig.schema.json` | `command` examples include the three tags. |
| `@lumpcode/cli-utils` README (if it lists preset types) | Mention the new exports. |

## Acceptance criteria

1. `"command": "claude-code" | "opencode" | "codex"` resolves to a shipped preset when no project/global override exists, and requires `claude` / `opencode` / `codex` on `PATH`.
2. Whitespace-only prompts skip (`null`); non-empty prompts return the agreed `CommandDescriptor` argv for each agent.
3. Session state lives under `claude-codeSetup` / `opencodeSetup` / `codexSetup` with `setupChatId` + `chatsIds`; `newChat` / `chatIdIndex` match cursor/copilot semantics.
4. Claude mints UUID in setup; OpenCode/Codex create-and-parse in setup/`newChat` and resume on later turns.
5. Defaults: Claude `--permission-mode acceptEdits` + built-in git commit/push denies; OpenCode `--auto`; Codex `--sandbox workspace-write`; no implicit dangerous bypass.
6. `model` / `agentPermissions` resolve step-over-lump; OpenCode omits `-m` when unset.
7. `@lumpcode/cli-utils` exports the closed types; type tests pass at the same strictness as cursor/copilot.
8. `ensurePresetCommandsInstalled` / `reset-presets` install the three modules; name-list tests updated.
9. CLI DOCS and schema examples document the three presets alongside cursor/copilot.

## Reference: comparison to existing presets

| Concern | `cursor` | `copilot` | `claude-code` | `opencode` | `codex` |
| --- | --- | --- | --- | --- | --- |
| Binary | `cursor-agent` | `copilot` | `claude` | `opencode` | `codex` |
| Session create | `create-chat` CLI | `randomUUID` | `randomUUID` | JSON run + parse | `exec --json` + parse |
| Resume flag | `--resume` | `--session-id` | `--session-id` | `-s` | `exec resume` |
| Default model | `auto` | `auto` | `auto` | omit | `auto` |
| Built-in git deny | via config dir docs | yes | yes | docs only | docs only |
