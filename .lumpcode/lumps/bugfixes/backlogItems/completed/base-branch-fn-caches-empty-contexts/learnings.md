# Learnings

## Expected
`desc.yml`: a function `baseBranch` is resolved by calling `getContextListFn` with `codeBasePaths: []` and caching that empty list, so the function sees no contexts and the run stays empty. Workflow: `impl`. Priority 20. No `dependsOn`.

`requirements.md`: in `jsConfigToRunLumpInput` only, the early list call that feeds a function `baseBranch` passes `getCodeBasePaths` of `projectRoot` (`dirname` of `localConfigFolderPath`). The cache stores that list. It does not store a call made with `codeBasePaths: []`. A scan failure fails resolve with the scan error. A string `baseBranch` does not start an early list call. A constant `getContextListFn` still supplies its list. `lump-plan` and `run` keep sharing this resolver. Tests in `dynamicDiscoveryBranch.unit.test.ts`: path template `src/{NAME}.ts` with `src/index.ts` resolves to `dev` and the run list contains `index`; existing B4 still passes the constant list. No `testPlan.md` or `expect.yml`. `@lumpcode/core`, `@lumpcode/recipes`, and docs stay unchanged.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts`: a function `baseBranch` loads contexts from `getCodeBasePaths({ cwd: projectRoot })`. That result is what the cache keeps. Scan failure returns the scan error.
- `packages/apps/cli/src/utils/jsConfigToRunLumpInput/testing/dynamicDiscoveryBranch.unit.test.ts`: the path-template repro resolves `baseBranch` to `dev` and the returned list contains `index`. A string `baseBranch` does not scan and does not pin an empty list. A missing project root fails resolve with the scan error. B3b, B4, and B5 use a real temp project so the scan can succeed; B4 still feeds the constant list to the function.
- `learnings.md` (this file).

`npm run test -w=@lumpcode/cli` passed (1399 tests).
