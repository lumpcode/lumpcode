# Say which chat indexes exist when a preset step's chatIdIndex misses

Every agent preset (cursor, claude-code, codex, copilot, opencode) picks its chat through `resolvePresetChatSession` (`packages/apps/cli/src/presets/commands/utils/resolvePresetChatSession.js`). A step can set `chatIdIndex` to continue an earlier chat. The setup chat is stored under `"0"`, and a step with `newChat: true` stores its new chat under its own step index, joined with dots when nested (`"1.2"`). When `chatIdIndex` named an index that held no chat, the step failed with:

```
Chat ID not found for index: 2
```

That message did not say which indexes held a chat or how an index gets one. The docs only list `chatIdIndex` as a step-only key, so the operator had to read the preset source to learn that the earlier step needs `newChat: true`, or that a nested step's key is dotted. The message now lists the indexes that exist and says how a chat gets stored under one:

```
chatIdIndex "2" names no chat. Known chat indexes: 0. A step with newChat: true stores its chat under its own step index ("1", or "1.0" when nested) for later steps to reuse.
```

When to throw is unchanged; only the text changed. The other branch (`Chat ID not found in <agent> setup state`) is untouched. The fixture copies under `jsConfigToRunLumpInput/__fixtures__/global-config/commands/presets/` already differ from the real presets and no test compares them, so I left them alone. The old string still appears only in the completed `abstractionImplementer` ticket's `requirements.md`, which is a historical record.

Tests: `resolvePresetChatSession.unit.test.ts` now expects the full new message when no chats are stored (`Known chat indexes: none`), and adds a case where `chatsIds` holds `0` and `1.2` and the lookup of `1` lists both.

Checks: `npm run test -w=@lumpcode/cli` (172 files, 1338 tests pass) and root `npm run build` (passes). On a fresh worktree, `scripts/npm-pack-postinstall.unit.test.mjs` fails until the bundle exists, so run the build before the CLI tests.
