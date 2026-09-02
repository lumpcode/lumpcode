---
title: Agents
description: Lumpcode invokes the CLI agent you already have. Set command to a shipped preset, a small module, or an inline function.
---

The lump field `command` is not a shell line. It is one of:

1. **Tag** — `"cursor"`, `"copilot"`, `"claude-code"`, `"opencode"`, `"codex"`, or your module name.
2. **Lump-relative file** — no whitespace, ends in `.ts` or `.js`. Loaded as a command module. `commandName` is the literal string.
3. **Inline `CommandFn`** — JS/TS only. Return `{ executable, args, env? }` to run, or `null` / `undefined` / nothing to skip (no process; `postCommandExecFn` still runs).

Agent flags belong in `executable` + `args`. Resolve order for a tag: project `.lumpcode/commands/<name>.ts` then `.js`, then the same under `~/.lumpcode/commands/`, then shipped presets (`.js` only). `lumpcode reset-presets` restores the shipped files.

```ts config.ts
command: 'cursor'

command: './runAgent.ts'

command: ({ prompt }) => ({ executable: 'my-agent', args: ['-p', prompt] })
```

## Shipped presets

| Config value | Binary on `PATH` | Default model flag |
| --- | --- | --- |
| `cursor` | `cursor-agent` | `auto` |
| `copilot` | `copilot` | `auto` |
| `claude-code` | `claude` | omitted when unset |
| `opencode` | `opencode` | omitted when unset |
| `codex` | `codex` | omitted when unset |

Claude Code and ChatGPT Codex reject `auto`. Leave `model` unset for those two unless you have a real model id.

Presets run headless. Copilot and Claude Code deny agent `git commit` / `git push`. Cursor, OpenCode, and Codex do not always; deny git write in those agents. Lumpcode owns marker commits.

## `model` and permissions

Presets read `lumpVariables` and `stepVariables`. **Step overrides lump.** Closed types: `CursorPresetLumpVariables`, `CopilotAgentPermissions`, … on `@lumpcode/cli-utils`. Step-only session keys: `newChat`, `chatIdIndex`.

```ts config.ts
import { defineConfig } from '@lumpcode/cli-utils'

export default defineConfig({
  command: 'cursor',
  lumpVariables: { model: 'auto' },
  steps: [
    {
      promptTemplate: 'Analyze @{FILE}. Do not edit.',
      stepVariables: { model: 'composer-2' },
    },
    { promptTemplate: 'Apply the safe fixes to @{FILE}.' },
  ],
})
```

| Preset | `agentPermissions` |
| --- | --- |
| `cursor` | `cursorConfigDir` → `CURSOR_CONFIG_DIR` |
| `copilot` | `writablePaths`, `denyShell` (preset already denies `git commit` / `git push`) |
| `claude-code` | `permissionMode` (default `acceptEdits`), `allowedTools`, `disallowedTools`, `addDirs`, `bare` |
| `opencode` | `auto` (default on), `agent` |
| `codex` | `sandbox` (default `workspace-write`), `addDirs`; `dangerouslyBypassApprovalsAndSandbox` only when `true` |

Unattended Cursor: a dedicated `cli-config.json` that denies `git commit` / `git push`, pointed at with `agentPermissions.cursorConfigDir`:

```json cli-config.json
{
  "version": 1,
  "permissions": {
    "allow": ["Write(**)", "Read(**)", "Shell(*)"],
    "deny": ["Shell(git:commit*)", "Shell(git:push*)"]
  }
}
```

```ts config.ts
lumpVariables: {
  agentPermissions: { cursorConfigDir: '/home/worker/.cursor-unattended' },
}
```

## Custom command module

```ts .lumpcode/commands/my-agent.ts
import { defineCommand } from '@lumpcode/cli-utils'

export const command = defineCommand(({ prompt }) => ({
  executable: 'my-agent',
  args: ['--message', prompt],
}))
```

Optional `setup` and `teardown` compose with the lump’s `setupFn` / `teardownFn` (lump setup first; teardown reversed). Command setup state lives at `contextRunState["<commandName>Setup"]`.

Same skip contract as inline `command`: return nothing and no process runs.

```ts .lumpcode/commands/my-agent.ts
import { defineCommand } from '@lumpcode/cli-utils'

export const command = defineCommand(({ prompt }) => {
  if (prompt.trim() === '') return
  return { executable: 'my-agent', args: ['--message', prompt] }
})
```

The agent `cwd` is the **branch workspace** (`workspacePath`). `projectRoot` is the source checkout that contains `.lumpcode/`. In `shared` mode those are different folders.

Signatures: [types](/docs/config/types).

## Skill versus the agent inside a lump

`npx skills add lumpcode/skills` helps the agent **in your editor** write lumps. It is not invoked when a lump runs. The lump’s `command` is.
