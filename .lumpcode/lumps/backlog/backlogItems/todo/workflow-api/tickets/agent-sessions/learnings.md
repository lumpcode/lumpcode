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
