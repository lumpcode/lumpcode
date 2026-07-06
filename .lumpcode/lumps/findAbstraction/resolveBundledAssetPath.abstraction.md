# resolveBundledAssetPath

## Repeated pattern

The CLI ships static assets beside the bundle (JSON schemas, preset command modules, SEA sidecars). Two modules resolved those paths with the same three-step layout:

1. **SEA binary** — `path.join(path.dirname(process.execPath), <relative>)`
2. **ncc bundle** — asset copied next to `__dirname` in `dist/`; use it when `fs.existsSync` succeeds
3. **Monorepo dev** — fall back to `path.join(__dirname, '../../…')` where sources live before `build:bundle`

The duplicated helpers were `resolveSchemaPath` in `validateLumpJsonConfig/main.ts` and `resolveBundlePresetsDirPath` in `ensurePresetCommandsInstalled/main.ts`. Same `isSea()` branch, same `existsSync` probe, same dev fallback shape.

## Why this name

`resolveBundledAssetPath` names the operation: given the compiled module directory (`callerDir`) and relative paths for bundle vs dev layouts, return the absolute path to a shipped asset. It is generic across schemas, presets, and future sidecars without encoding a specific asset kind.

## Files changed

**Added (core)**

- `packages/core/src/utils/resolveBundledAssetPath/main.ts`
- `packages/core/src/utils/resolveBundledAssetPath/index.ts`
- `packages/core/src/utils/resolveBundledAssetPath/unit.test.ts`
- `packages/core/src/utils/index.ts` (barrel export)

**Refactored (cli)**

- `packages/apps/cli/src/utils/validateLumpJsonConfig/main.ts` — removed `resolveSchemaPath`
- `packages/apps/cli/src/utils/ensurePresetCommandsInstalled/main.ts` — removed `resolveBundlePresetsDirPath`

## Line count (approximate)

| | Lines |
|---|---|
| Removed from CLI call sites | ~28 |
| Added util + barrel (excl. unit tests) | ~15 |
| **Net reduction** | **~2** |

(Counts from `wc -l` on the new util `main.ts` + `index.ts` and line diff on the two refactored CLI files.)
