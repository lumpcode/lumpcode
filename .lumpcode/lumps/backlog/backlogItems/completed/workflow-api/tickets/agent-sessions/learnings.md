# Learnings

## Expected
`desc.yml` (`workflow: [manualReq, testImpl, impl]`, depends on `core`): the CLI implements `Agent` on command modules. `agent.session()` has both call signatures, `agent.prompt()` uses the default command's default session, presets load on first use, `sessionId` reaches `CommandFn`, modules may export `createSession`, and `setup` may return `sessionId`. That moves into `claude-code`, `codex`, `copilot`, `cursor`, and `opencode`, with the session ownership check. Steps lumps and custom presets without the new exports stay as they are.

`requirements.md` testing strategy: `createCliAgent/unit.test.ts` (both signatures, double-command error, lazy setup once, UUID fallback, ownership error, unknown id, option layering, teardown of each used command), `presets/commands/*.unit.test.ts` (given `sessionId` is the chat id, steps path unchanged, `setup` returns `sessionId`), and a `run` of a workflow fixture with two presets and no `registerCommands` (both run, transcript shows both command names). No `testPlan.md` or `expect.yml` on this item or the parent. The parent `requirements.md` is the agent contract. This stage writes skipped tests and does not create `testPlan.md`.

## Landed
Working tree only. The marker commit for this stage does not exist yet.

Skipped tests:
- `packages/apps/cli/src/utils/createCliAgent/unit.test.ts`
- `packages/apps/cli/src/presets/commands/session.unit.test.ts` (`workflow sessionId` describe). The steps-path cases in that file are live: they match today's presets.
- `packages/apps/cli/src/utils/jsConfigToRunLumpInput/testing/workflowAgentSessions.integration.test.ts`

So the skipped suite can import, this stage also adds a throwing `createCliAgent` (`packages/apps/cli/src/utils/createCliAgent/main.ts`, `index.ts`, exported from `packages/apps/cli/src/utils/index.ts`) and an optional `createSession` on `packages/apps/cli/src/types/CommandModule.ts`.

## impl Expected
`desc.yml` (`workflow: [manualReq, testImpl, impl]`, depends on `core`) and `requirements.md`: the CLI passes `createAgent` into `runLump`. `agent.session()` has both call signatures, presets load on first use, `createSession` or a UUID supplies a missing id, a `sessionId` from this run stays on its command, and `agent.prompt()` reuses the default command's setup session. `claude-code`, `codex`, `copilot`, `cursor`, and `opencode` export `createSession`, accept `sessionId`, and return it from `setup`. Steps lumps and modules without those exports stay as they are. Unskip the three suites from the test stage and make them pass. Docs: `createSession` and the `sessionId` input, in the section that documents command-module exports. No `testPlan.md` or `expect.yml` on this item or the parent. The parent `requirements.md` is the agent contract.

## impl Landed
Working tree only. The marker commit for this stage does not exist yet.

- `packages/apps/cli/src/utils/createCliAgent/main.ts`
- `packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts` (workflow configs get `createAgent`, omit `steps`, and leave command `setup` to first use; `loadCommandModule` keeps `createSession`)
- `packages/apps/cli/src/presets/commands/claude-code.js`
- `packages/apps/cli/src/presets/commands/codex.js`
- `packages/apps/cli/src/presets/commands/copilot.js`
- `packages/apps/cli/src/presets/commands/cursor.js`
- `packages/apps/cli/src/presets/commands/opencode.js`
- `packages/apps/cli/src/utils/createCliAgent/unit.test.ts` (unskipped)
- `packages/apps/cli/src/presets/commands/session.unit.test.ts` (unskipped `workflow sessionId`)
- `packages/apps/cli/src/utils/jsConfigToRunLumpInput/testing/workflowAgentSessions.integration.test.ts` (unskipped)
- `packages/apps/cli/DOCS/config/types.md` (Command module: `createSession`, `sessionId`)
- `packages/apps/cli/DOCS/author/agents.md` (link to that section)
- `.lumpcode/lumps/backlog/backlogItems/todo/workflow-api/tickets/agent-sessions/learnings.md`

## impl Adjustments
Prompt option layering always forwards the merged `stepVariables`, so a bare prompt still carries the lump `model`. The argv checks now expect `stepVariables: { model: 'lump-model' }`, which is `openAgent`'s default lump model.

History dump uses `lineWidth: 0`, so every string is a folded scalar. The integration check looks for `command: >-\n    alpha` and the same for `beta`, which is what the history file contains.
