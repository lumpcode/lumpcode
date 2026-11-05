# Remove uncalled `e2eBinary` from the CLI e2e harness

Removed `e2eBinary` from `packages/apps/cli/src/e2e/harness/e2eCli.ts`. It only returned `e2eInvocation.executable`. Every e2e spawn goes through `runE2eCli` or `e2eCliInvocation()`, and both read the same module-level `e2eInvocation`. Test behavior does not change.

## Why it is unused

- `rg --hidden e2eBinary` across the repo (excluding `node_modules` and `.git`, substring rather than whole-word) matches only its own definition and the previous trimmer note. Nothing calls it: no test, no docs, no `.lumpcode/` or `.agents/` reference.
- `e2e/harness/index.ts` re-exports `e2eCli` with `export *`, but nothing imports the name through the barrel either (same search).
- Nothing under `packages/apps/cli/src/e2e/` uses a dynamic `import()`.
- The harness is not published. `@lumpcode/cli` ships only `bin/lumpcode.js`, the ncc bundle, schemas, presets, and install scripts. Both CLI tsconfigs exclude `src/e2e/**`.

## Checks

- `npm run build`: passed.
- `npm run test -w=@lumpcode/cli`: 165 files and 1244 tests passed, no type errors. The packaging test (`scripts/npm-pack-postinstall.unit.test.mjs`) needs `dist/index.js`, so it only passes after the build.

## Follow-up candidates (not touched)

These are still definition-only in the harness: `expectCliFailureEnvelope` in `e2eCli.ts`, `commitAndPushMain` in `createE2eProject.ts`, and `inlineE2eMockAgentCommandFn` in `createE2eAgentCommandModule.ts`.
