---
title: Agents
description: Lumpcode invokes the CLI agent you already have. Set command to a shipped preset, or point at a small module.
---

The lump field `command` is a **tag** (`"cursor"`, `"copilot"`, …) or a lump-relative `.ts` / `.js` file. It is not a shell line. Agent flags belong in the command module (`executable` + `args`), not in the config string.

## Shipped presets

| Config value | Binary on `PATH` | Default model flag |
| --- | --- | --- |
| `cursor` | `cursor-agent` | `auto` |
| `copilot` | `copilot` | `auto` |
| `claude-code` | `claude` | omitted when unset |
| `opencode` | `opencode` | omitted when unset |
| `codex` | `codex` | omitted when unset |

Claude Code and ChatGPT Codex reject `auto`. Leave `model` unset for those two unless you have a real model id.

Presets run headless (no approval prompts). Copilot and Claude Code presets deny agent `git commit` / `git push`. Cursor, OpenCode, and Codex do not always; configure those agents so they cannot commit. Lumpcode owns marker commits.

Override a preset by dropping `.lumpcode/commands/<name>.ts` (project) or `~/.lumpcode/commands/<name>.ts` (this machine). Resolution: project `.ts` then `.js`, then the same under `~/.lumpcode/commands/`, then shipped presets (`.js` only). `lumpcode reset-presets` restores the shipped files.

## `model` and permissions

Presets read `lumpVariables` and `stepVariables`. **Step overrides lump.**

```ts
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

`agentPermissions` is preset-specific (Cursor `cursorConfigDir`, Copilot `writablePaths` / `denyShell`, Claude `permissionMode` / `addDirs`, Codex `sandbox` / `addDirs`, OpenCode `auto` / `agent`). Types live on `@lumpcode/cli-utils`.

Recommended for unattended Cursor: a dedicated `cli-config.json` that denies `git commit` and `git push`, pointed at with `agentPermissions.cursorConfigDir`.

## Custom command module

```ts
import { defineCommand } from '@lumpcode/cli-utils'

export const command = defineCommand(({ prompt }) => ({
  executable: 'my-agent',
  args: ['--message', prompt],
}))
```

Optional `setup` and `teardown` compose with the lump’s `setupFn` / `teardownFn`. Command setup state is stored under `contextRunState["<commandName>Setup"]`.

The agent process `cwd` is the **branch workspace** (`workspacePath`). `projectRoot` is the source checkout that contains `.lumpcode/`. In `shared` mode those are different folders; do not assume they are the same.

You can also set `command` to a lump-relative file (`./my-agent.ts`) instead of a tag. `commandName` is the literal string in config.

## Skill versus the agent inside a lump

`npx skills add lumpcode/skills` helps the agent **in your editor** write lumps. It is not invoked when a lump runs. The lump’s `command` is.
