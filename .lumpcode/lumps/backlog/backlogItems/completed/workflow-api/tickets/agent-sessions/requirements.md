# Requirements: Agent sessions over command modules

| Field | Value |
| --- | --- |
| **Backlog** | `workflow-api` / `agent-sessions` · priority **12** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `core` (`createAgent`, `runAgentCall`, the `Agent` types) |
| **Contract** | `../../requirements.md` (Interfaces: agent; CLI: command modules) |
| **Packages** | `@lumpcode/cli` (primary: a new util, `types/CommandModule.ts`, `presets/commands/*`, `utils/jsConfigToRunLumpInput`). `@lumpcode/core` unchanged beyond `core`. |

## Problem statement and motivation

Agent chats are chosen inside each preset from `stepVariables` (`newChat`, `chatIdIndex`, step-index keys) by `presets/commands/utils/resolvePresetChatSession.js`, and creating a chat is hidden in each preset (`cursor-agent create-chat`, `createCodexSession`, `createOpenCodeSession`, `randomUUID`). Presets only get `setup` when registered up front (`command` or `registerCommands`). A workflow needs `await agent.session('cursor')` and a real `sessionId`.

## Goals

1. The CLI passes `createAgent` to `runLump`, implementing the umbrella `Agent` with command modules.
2. Any preset tag or custom `CommandFn` works in `session()`, loaded on first use.
3. Built-in presets create sessions through a `createSession` export and accept a given `sessionId`.
4. Steps lumps and custom presets without the new exports behave as today.

## Non-goals

- Session renaming. Changing preset output parsing (`presentOutput`).
- Config fields and `lump-plan` (`config-and-plan`).

## Proposed behavior

| Call | Behavior |
| --- | --- |
| `agent.session()` / `agent.session({ … })` | Command: `options.command`, else the lump's `command` |
| `agent.session('cursor', { … })` / `agent.session(fn, { … })` | Command: the first argument |
| Command given both ways | `Pass the command once: as the first argument or as options.command.` |
| First use of a command in the context | Load the module (as `registerCommands` does today), run its `setup` with the context, merge its `contextRunState`; its `sessionId` becomes the command's default session |
| No `sessionId` | `createSession({ lumpVariables, model, workspacePath })`, else `randomUUID()` |
| `sessionId` created in this run by another command | `Session <id> belongs to command <a>, not <b>.` |
| `sessionId` unknown to this run | Used as given |
| `session.prompt(text, options)` | Options merged lump → session → call; `runAgentCall({ commandFn, commandName, prompt, sessionId, stepVariables: { model, agentPermissions, extraArgs } })` |
| `agent.prompt(text)` | Default command's default session: from `setup`, else created on first call and reused |
| End of the context | `teardown` of every command used, as `composeTeardownFn` does for registered ones |

Preset change (each of `claude-code`, `codex`, `copilot`, `cursor`, `opencode`):

```js
export const createSession = async ({ lumpVariables, model }) => /* existing createChatId logic */;

export const command = async ({ prompt, sessionId, stepVariables = {}, contextRunState, stepIndex, lumpVariables = {} }) => {
  const chatId = sessionId ?? await resolvePresetChatSession({ /* unchanged */ });
  // rest unchanged
};

export const setup = async (input) => {
  const id = /* existing */;
  return { ...initialPresetChatRunState(id), sessionId: id };
};
```

Presets are reinstalled by `postinstall` / `reset-presets`, so the shipped files change; user-edited copies without the exports keep working through the UUID fallback.

## Technical approach

| Step | Files | Change |
| --- | --- | --- |
| 1 | `src/types/CommandModule.ts` | Optional `createSession` |
| 2 | new util `src/utils/createCliAgent/` | `createCliAgent({ commandModules, loadCommandModule, defaultCommand }) → (input: CreateAgentInput) => Agent`. **Single owner** of argument parsing, lazy load and setup, the session → command registry, option layering, teardown tracking |
| 3 | `src/utils/jsConfigToRunLumpInput/main.ts` | Pass `createAgent` when the config has `workflow`; reuse the existing module loader (no second loader) |
| 4 | `src/presets/commands/*.js` | `createSession`, `sessionId` input, `sessionId` in `setup` |
| 5 | `src/presets/commands/utils/resolvePresetChatSession.js` | Unchanged; only called when `sessionId` is absent |

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `createCliAgent/unit.test.ts` with a fixture preset (writes its argv to a file) | Both signatures; double command error; lazy setup once per command; UUID fallback; ownership error; unknown id passthrough; option layering; teardown for each used command |
| Unit | `presets/commands/*.unit.test.ts` | Given `sessionId` used as the chat id; steps path unchanged; `setup` returns `sessionId` |
| Integration | `run` of a workflow fixture using two fixture presets with no `registerCommands` | Both presets run; transcript shows both command names |

## Docs updates

`DOCS/reference/` command-module page: the `createSession` export and the `sessionId` input, in the canonical section that documents preset exports.

## Acceptance criteria

1. `agent.session('cursor')` and `agent.session()` in one workflow run two presets without `registerCommands`.
2. `await agent.session({ sessionId: s.sessionId })` sends the next prompt to the same agent chat (fixture argv shows the same id).
3. A preset copy without `createSession` gets a UUID `sessionId` and still runs.
4. Every existing preset and steps test passes unchanged.
