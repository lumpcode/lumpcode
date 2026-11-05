# Remove deprecated, uncalled `resolveE2eBinary` from the CLI e2e harness

Removed `resolveE2eBinary` from `packages/apps/cli/src/e2e/harness/resolveE2eCliInvocation.ts`. It was marked `@deprecated` and "kept for callers that only need the SEA path", but no such caller exists. It only returned `resolveE2eCliInvocation().executable`. The e2e harness spawns the CLI through `e2eCliInvocation()` / `runE2eCli` in `e2eCli.ts`, which read the same `resolveE2eCliInvocation()` result. Test behavior does not change.

## Why it is unused

- `rg --hidden -w resolveE2eBinary` across the repo (excluding `node_modules`, `dist`, `.git`) matches only its own definition. No caller, no test, no docs, no `.lumpcode/` or `.agents/` reference.
- `e2e/harness/index.ts` re-exports the module with `export *`, but nothing imports the name through the barrel either (same search).
- There are no dynamic `import()` calls under `src/e2e/`.
- The harness is not published. `@lumpcode/cli` ships only `bin/lumpcode.js`, the ncc bundle `dist/index.js`, schemas, and presets. Both CLI tsconfigs exclude `src/e2e/**`.

## Checks

- `npm run test -w=@lumpcode/cli`: 162 files and 1223 tests passed, no type errors.
- `npm run build`: passed.

## Follow-up candidates (not touched)

The same scan found other definition-only names in the harness: `e2eBinary` and `expectCliFailureEnvelope` in `e2eCli.ts`, `commitAndPushMain` in `createE2eProject.ts`, and `inlineE2eMockAgentCommandFn` in `createE2eAgentCommandModule.ts`. It also found `gitCommonDirLocksDirPath` in `utils/gitCommonDirLock/main.ts`.
