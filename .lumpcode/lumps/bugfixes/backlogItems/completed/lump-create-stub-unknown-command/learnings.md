# Learnings

## Expected
`impl` from `desc.yml`: `lump-create` scaffolds `config.json`, `config.js`, and `config.ts` with `command: "claude"`, which is not a shipped preset (the Claude Code tag is `claude-code`), so `lump-plan` and `run` fail with `Failed to load command module 'claude'`. Fix the stubs in `commands/lump-create/main.ts`.

`requirements.md`: every stub names a command tag that resolves to a shipped preset (`claude-code`, `codex`, `copilot`, `cursor`, `opencode`). The stub `command` becomes `claude-code` in the JSON stub and the shared JS/TS stub. Output messages and the `{ lumpName, configPath, configFormat }` envelope stay the same. `baseBranch`, `contextListJson`, the prompt text, other tests' `claude` fixtures, docs, core, and recipes stay unchanged. A unit test fails if a stub names a tag that is not a file in `packages/apps/cli/src/presets/commands/*.js`. Optionally, a JSON stub loaded through the lump config loader resolves its command module. `npm run test -w=@lumpcode/cli` is green. This item has no `testPlan.md` or `expect.yml`. The parent lump has none either.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/commands/lump-create/main.ts` sets `command` to `claude-code` in the JSON stub and the JS stub (`config.ts` reuses the JS stub) (−2/+2).
- `packages/apps/cli/src/commands/lump-create/unit.test.ts` checks each format's loaded `prompt.command` against the shipped preset tags, and loads the JSON stub through `jsConfigToRunLumpInput` so the command module resolves (−0/+93).
- `learnings.md` (this file).

`npm run test -w=@lumpcode/cli` passed (1263 tests) after `npm run build:bundle -w=@lumpcode/cli`, the same order CI uses.
