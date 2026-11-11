# Remove uncalled `commitAndPushMain` from the CLI e2e harness

Removed `commitAndPushMain` from `packages/apps/cli/src/e2e/harness/createE2eProject.ts`. It was a one-line wrapper that called `gitCommitAllAndPush` on the project root, and no e2e spec calls it. The `gitCommitAllAndPush` import stays because `pushIntegrationBranch` still uses it. Test behavior does not change.

## Why it is unused

- `rg --hidden commitAndPushMain` across the repo (excluding `node_modules`, `.git`, and `dist`, substring rather than whole-word) matched only its own definition and the previous trimmer note, which listed it as a follow-up candidate. No test, docs, `.lumpcode/`, or `.agents/` file references it.
- `e2e/harness/index.ts` re-exports `createE2eProject` with `export *`, but the same search finds no import of the name through the barrel.
- `rg 'import\(|require\('` under `packages/apps/cli/src/e2e/` finds no dynamic imports or requires outside `node:` builtins.
- The harness is not published. Both CLI tsconfigs exclude `src/e2e/**`, and the package `files` list ships only the bin, the ncc bundle, schemas, presets, and install scripts.

## Checks

- `npm run test -w=@lumpcode/cli`: 166 files and 1268 tests passed, no type errors.
- `npm run build`: passed. Turbo served every task from cache, which is expected because the `@lumpcode/cli#build` inputs exclude `src/e2e/**`.
- Ad hoc `tsc --noEmit` over `src/e2e/**`, using a throwaway config that extends `tsconfig.typecheck.json`: 3 errors, the same count as on the unmodified tree. The errors are in `gitHelpers.ts` (`replaceAll` needs a newer `lib`) and `runLumpFromLumpName/main.ts`, not in the edited file.

## Follow-up candidates (not touched)

- `inlineE2eMockAgentCommandFn` in `createE2eAgentCommandModule.ts` is still definition-only. Removing it also makes the `relativeTo: 'lump'` branch of `e2eMockAgentScriptPathExpr` dead, so it is a slightly larger trim.
- `createE2eProject.ts` imports `defaultE2eTsLumpConfig` but never uses it in that file.
