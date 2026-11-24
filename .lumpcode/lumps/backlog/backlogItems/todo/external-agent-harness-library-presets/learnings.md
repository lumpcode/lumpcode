# Learnings

## Expected

`desc.yml` (`workflow: [req, impl]`, priority 80, no `dependsOn`): use a vendor SDK in place of the hand-written argv in `presets/commands` only where that SDK can run the local preset and can pass the `extraArgs` string list through, including flags added later. Otherwise that preset stays on argv. Do not adopt `@pivanov/agents-wire`, `coding-agent-runner`, or another CLI unifier. `@cursor/sdk` may run the local cursor preset because ideasToBacklog already depends on it. Copilot, Claude Code, OpenCode, and Codex stay on argv until their SDK can do that job. Not ACP. Distinct from `presets-typescript-package`. Keep `model` (step over lump; cursor and copilot default `auto`; claude-code, opencode, and codex omit the flag when unset), the closed `agentPermissions` object, `newChat`, `chatIdIndex`, and `outputDetail`. No `effort` field. `extraArgs` stays a string list. A step list replaces the lump list, and `[]` clears it. Codex still places its list before `resume`.

`requirements.md` applies that gate: none of the five presets move. It names the SDK slot that was checked for each and the argv that stays. `resolvePresetExtraArgs` remains the only reader of the list. No new dependency, no `@cursor/sdk` bump, and the ideasToBacklog cloud agent stays the only `@cursor/sdk` caller. No docs change. This item has no `testPlan.md` or `expect.yml`. No parent copy exists.

## Landed

No marker commit yet. This working tree is the req stage.

- `.lumpcode/lumps/backlog/backlogItems/todo/external-agent-harness-library-presets/requirements.md` — the decided plan.
- `.lumpcode/lumps/backlog/backlogItems/todo/external-agent-harness-library-presets/learnings.md` — this file.

`desc.yml` was not edited.
