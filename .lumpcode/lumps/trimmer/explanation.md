# Drop the unused `defaultE2eTsLumpConfig` import from `createE2eProject.ts`

Removed `defaultE2eTsLumpConfig` from the import list in `packages/apps/cli/src/e2e/harness/createE2eProject.ts`. The file imported it from `./createE2eAgentCommandModule` and never used it. The function itself stays, because `ts-config-scenarios.test.ts` uses it. The previous trimmer note listed this import as a follow-up candidate. No behavior changes.

## Why it is unused

- `rg --hidden 'defaultE2eTsLumpConfig'` across the repo (excluding `node_modules`, `.git`, and `dist`) matches the definition in `createE2eAgentCommandModule.ts`, the removed import line, the uses in `ts-config-scenarios.test.ts`, and the previous trimmer note. After the import, `createE2eProject.ts` never mentioned the name again.
- `ts-config-scenarios.test.ts` imports the function through the `./harness` barrel. `harness/index.ts` re-exports `./createE2eAgentCommandModule` directly with `export *`, so the test does not depend on `createE2eProject.ts`. An `import` is not a re-export in any case.
- The module is still imported for `createE2eAgentCommandModule`, `createE2eMockAgentScript`, `defaultE2eLumpConfigJson`, and `E2E_MOCK_AGENT_SCRIPT_BASENAME`, so dropping one named binding changes no load order or side effects.

## Checks

- `npm run test -w=@lumpcode/cli`: 172 files and 1337 tests passed, no type errors. The first run failed one test in `npm-pack-postinstall.unit.test.mjs` only because this fresh worktree had no `dist/index.js`. After `npm run build` it passed.
- `npm run build`: passed. Turbo served every task from cache, because the `@lumpcode/cli#build` inputs exclude `src/e2e/**`.
- Ad hoc `tsc --noEmit` over `src/e2e/**`, using a throwaway config (since deleted) that extends `tsconfig.typecheck.json`: the same 3 errors before and after the change, in `gitHelpers.ts` and `runLumpFromLumpName/main.ts`, not in the edited file.
