# Remove uncalled `inlineE2eMockAgentCommandFn` from the CLI e2e harness

Removed `inlineE2eMockAgentCommandFn` from `packages/apps/cli/src/e2e/harness/createE2eAgentCommandModule.ts`. It built an inline mock-agent `command` function for lump `config.js` files, and no e2e spec calls it. It was the only caller that passed `relativeTo: 'lump'` to the private `e2eMockAgentScriptPathExpr`, so that branch could no longer run. I dropped the `relativeTo` parameter and kept only the `../lumps/<name>/` path that `createE2eAgentCommandModule` uses. The generated command module source is byte-identical.

## Why it is unused

- `rg --hidden -i 'inlineE2eMock|relativeTo'` across the repo (excluding `node_modules`, `.git`, and `dist`, substring rather than whole-word) matched only the definition, the two `e2eMockAgentScriptPathExpr` call sites in the same file, and the previous trimmer note, which listed it as a follow-up candidate. No test, docs, `.lumpcode/`, or `.agents/` file references it.
- `e2e/harness/index.ts` re-exports the module with `export *`, but the same search finds no import of the name through the barrel.
- `rg 'import\(|require\('` under `packages/apps/cli/src/e2e/` finds nothing outside `node:` builtins, so no dynamic import reaches the harness.
- The harness is not published. Both CLI tsconfigs exclude `src/e2e/**`, and the package `files` list does not ship it.

## Checks

- `npm run test -w=@lumpcode/cli`: 167 files and 1285 tests passed, no type errors.
- `npm run build`: passed. Turbo served every task from cache, which is expected because the `@lumpcode/cli#build` inputs exclude `src/e2e/**`.
- Ad hoc `tsc --noEmit` over `src/e2e/**`, using a throwaway config (since deleted) that extends `tsconfig.typecheck.json`: the same 3 errors before and after the change, in `gitHelpers.ts` (`replaceAll` needs a newer `lib`) and `runLumpFromLumpName/main.ts`, not in the edited file.

## Follow-up candidates (not touched)

- `createE2eProject.ts` imports `defaultE2eTsLumpConfig` but never uses it in that file. The function itself stays, because `ts-config-scenarios.test.ts` uses it.
