# Learnings

## Expected
`impl` from `desc.yml`: a lump `config.js`, or any `.js` module Lumpcode imports, that imports a relative `.ts` helper such as `.lumpcode/helpers/<name>/index.ts` fails with `ERR_UNKNOWN_FILE_EXTENSION`, because only `.ts` entries go through esbuild. Bundle `.js` / `.mjs` entries whose relative import graph reaches a `.ts` file the same way.

`requirements.md`: `needsTypeScriptTranspile` is the only decision. It is true for a `.ts` path, and for a `.js` / `.mjs` path when the existing relative scan (`base`, `base.ts`, `base/index.ts`) reaches a `.ts` file, including two hops through a `.js` file. Otherwise false. `transpileTypeScriptToCachedMjs` also accepts `.js` / `.mjs` entries, always bundles them with npm packages external, patches `import.meta.url` to the entry file, and uses the same cache layout and `.ts` dependency-mtime invalidation as bundled `.ts` entries. `isTypeScriptModulePath` stays as it is. `resolveImportable` uses that decision and does not scan imports. Plain `.js` / `.mjs` with no relative `.ts` stays on native `import()` and writes no transpile cache. `.cjs`, bare-specifier `.ts`, config precedence, log dedup, and type-checking stay out. Docs: helpers in `.lumpcode/helpers/` may be `.ts` and imported from `config.ts`, `config.js`, or a `.js` hook module. Tests cover the scan cases, a `.js` entry whose cache invalidates when the helper changes, `resolveImportable` loading that helper (existing R1 still writes no cache), and an e2e lump whose `config.js` imports `../../helpers/<name>/index.ts` and pushes its marker commit (named TS-S10). This item has no `testPlan.md` or `expect.yml`. The parent lump has none either.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/utils/transpileTypeScriptToCachedMjs/main.ts` adds `needsTypeScriptTranspile`, walks relative `.js` / `.mjs` files to find `.ts` dependencies, and always bundles `.js` / `.mjs` entries. `.cjs` stays on the native loader. Cache key and recorded mtimes are still the entry plus bundled relative `.ts` files (−9/+37).
- `packages/apps/cli/src/utils/transpileTypeScriptToCachedMjs/index.ts` exports `needsTypeScriptTranspile` (−1/+1).
- `packages/apps/cli/src/utils/resolveImportable/main.ts` chooses transpile with `needsTypeScriptTranspile` (−2/+2).
- `packages/apps/cli/src/utils/transpileTypeScriptToCachedMjs/unit.test.ts` covers the scan cases (including `.mjs` and `.cjs`), helper invalidation, external `@lumpcode/core`, `import.meta.url`, and a side-effect `.ts` import (−1/+134).
- `packages/apps/cli/src/utils/resolveImportable/unit.test.ts`: R1 asserts no esbuild call and no transpile cache; R6 loads a `.js` default export that calls a relative `.ts` helper (−6/+36).
- `packages/apps/cli/src/e2e/ts-config-scenarios.test.ts` adds TS-S11: `config.js` imports `../../helpers/jsTsHelper/index.ts`, and `run` pushes the marker commit (−0/+22).
- `packages/apps/cli/DOCS/examples/building-blocks.md` says helpers in `.lumpcode/helpers/` may be `.ts` and imported from `config.ts`, `config.js`, or a `.js` hook module (−1/+1).
- `learnings.md` (this file).

`npm run build -w=@lumpcode/cli` and `npm run test -w=@lumpcode/cli` passed (1223 tests). TS-S11 passed against the built CLI.

## Gap
The e2e scenario is TS-S11. TS-S10 already covers project-setup gitignore of the transpile cache.
