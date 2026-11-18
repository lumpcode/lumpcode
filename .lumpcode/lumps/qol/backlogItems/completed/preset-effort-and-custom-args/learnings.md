# Learnings

## Expected
`desc.yml` (`impl`, no `dependsOn`): every shipped agent preset takes an `extraArgs` string list from `lumpVariables` / `stepVariables` (step replaces lump) and passes it to the harness unchanged, so effort and other harness flags need no custom command module and no typed per-harness effort key.

`requirements.md`: `resolvePresetExtraArgs` owns the override and the `extraArgs must be an array of strings` check. The five presets spread that list after their own args; Codex places it after `resolveCodexArgs` and before `resume`. With no `extraArgs`, argv stays as it is. `PresetExtraArgsVariables` (`extraArgs?: readonly string[]`) is intersected into each lump-variables type and barrel-exported from `cli-utils/src/presets/index.ts`. Tests: the new util unit test, `extraArgs.unit.test.ts` for all five presets, and `extraArgs` accept/reject cases in `presetVariables.types.test.ts`. Docs: `agents.md` (`extraArgs`, placement, effort, `reset-presets`) and the `lumpVariables` row in `config/lump.md`. No E2E. `@lumpcode/core`, `@lumpcode/recipes`, `@lumpcode/cli-types`, and the lump config JSON schema stay unchanged. This item has no `testPlan.md` or `expect.yml`. No parent copy exists.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/presets/commands/utils/resolvePresetExtraArgs.js` (+15): step list replaces lump list, `[]` clears, missing returns `[]`, a non-array or non-string entry throws.
- `packages/apps/cli/src/presets/commands/{cursor,copilot,claude-code,opencode,codex}.js` (+3 each) call that util and spread the list at the documented position. None read `extraArgs` themselves.
- `packages/apps/cli/cli-utils/src/presets/extraArgs.ts` (+3) and the five lump-variables types (+2/−1 each). `cli-utils/src/presets/index.ts` barrel-exports `PresetExtraArgsVariables` (+1).
- `packages/apps/cli/src/presets/commands/utils/resolvePresetExtraArgs.unit.test.ts` (+53) and `packages/apps/cli/src/presets/commands/extraArgs.unit.test.ts` (+169).
- `packages/apps/cli/cli-utils/src/presets/presetVariables.types.test.ts` (−26/+95): closed lump contracts include `extraArgs`, and a string list is accepted while a string is rejected on lump and step variables for all five presets.
- `packages/apps/cli/DOCS/author/agents.md` (+8) and `packages/apps/cli/DOCS/config/lump.md` (−1/+1).
- `packages/apps/cli/cli-utils/src/index.ts` (+1) re-exports `PresetExtraArgsVariables`.
- `learnings.md` (this file).

`npm run build`, `npm run test -w=@lumpcode/cli` (1314 tests), and `npm run test -w=@lumpcode/cli-utils` (70 tests) passed.

## Gap
`cli-utils/src/index.ts` is in the diff. The requirements name the `PresetExtraArgsVariables` export on `cli-utils/src/presets/index.ts`. The package entry re-exports it the same way as the other preset types, so `import type { PresetExtraArgsVariables } from '@lumpcode/cli-utils'` resolves.
