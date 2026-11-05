# Requirements: JavaScript modules can import TypeScript helpers

| Field | Value |
| --- | --- |
| **Backlog** | `js-config-ts-imports` · priority **21** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `@lumpcode/cli` (`utils/transpileTypeScriptToCachedMjs`, `utils/resolveImportable`, TS config E2E). `@lumpcode/core` unchanged. |

## Problem statement and motivation

An operator's daemon logged, every tick:

```text
[lumpcode start] lump "<lump>": Failed to import <project>/.lumpcode/lumps/<lump>/config.js, error: TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for <project>/.lumpcode/helpers/copyProjectEnvFilesToWorktree/index.ts; skipping
```

The docs tell authors to put shared code in `.lumpcode/helpers/` and import it with a relative path. Helpers written in TypeScript work from `config.ts` but not from `config.js`.

1. `resolveImportable` only transpiles when the entry path ends in `.ts` (`isTypeScriptModulePath`). A `.js` entry goes straight to Node's native `import()`.
2. Node cannot load the relative `.ts` dependency, so the whole lump is skipped.
3. The same path loads lump `config.js`, `*Fn` module paths from `config.json`, and command modules, so any `.js` module that reaches a `.ts` file fails the same way.

## Goals

1. A `.js` or `.mjs` module loaded by `resolveImportable` may import relative `.ts` files, directly or through other relative modules.
2. Plain `.js` / `.mjs` modules with no relative `.ts` in their graph still load with native `import()` and no esbuild call.
3. Cache and invalidation behave as for `.ts` entries: keyed by entry path, invalidated when the entry or any bundled `.ts` dependency changes.

## Non-goals

- `.cjs` entries or CommonJS helpers.
- Bare-specifier (npm package) `.ts` imports. Packages stay external as today.
- Changing config precedence (`config.ts` > `config.js` > `config.json`).
- Deduplicating the repeated per-tick import error in daemon logs.
- Type-checking.

## User stories / use cases

1. As a lump author — my `config.js` imports `../../helpers/copyProjectEnvFilesToWorktree/index.ts`, so the daemon runs the lump instead of skipping it.
2. As a lump author — my `config.json` points `postSetupWorkspaceFn` at a `.js` file that imports a `.ts` helper, so the hook loads.
3. As an author of plain JS configs — nothing changes for me and no transpile cache is written.

## Proposed behavior and UX

No new CLI surface. Import errors for real problems (syntax errors, missing files) keep the existing `Failed to import …` / `Failed to transpile …` shapes.

### Canonical owner: `utils/transpileTypeScriptToCachedMjs`

| Export | Contract |
| --- | --- |
| `needsTypeScriptTranspile(absolutePath) → Promise<boolean>` (new) | `true` for a `.ts` path. For a `.js` / `.mjs` path, `true` when its relative import graph (the existing relative-specifier scan and resolution: `base`, `base.ts`, `base/index.ts`) contains at least one `.ts` file. Otherwise `false` |
| `transpileTypeScriptToCachedMjs(absolutePath)` (existing) | Also accepts `.js` / `.mjs` entries. Such entries are always bundled with npm packages external, `import.meta.url` patched to the entry file, and the same cache layout and dependency-mtime invalidation as bundled `.ts` entries |
| `isTypeScriptModulePath` (existing) | Unchanged |

`resolveImportable` decides with `needsTypeScriptTranspile` instead of `isTypeScriptModulePath`. No other caller decides whether a module needs transpiling, and no caller re-implements the relative import scan.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/utils/transpileTypeScriptToCachedMjs/main.ts` | Add `needsTypeScriptTranspile` on top of the existing dependency scan. Let JS entries through the transpile path, forced to bundle |
| 2 | `packages/apps/cli/src/utils/transpileTypeScriptToCachedMjs/index.ts` | Export the new function |
| 3 | `packages/apps/cli/src/utils/resolveImportable/main.ts` | Use `needsTypeScriptTranspile` to pick transpile vs native import |

## Testing strategy

| Level | What | Where |
| --- | --- | --- |
| Unit | `needsTypeScriptTranspile`: `.ts` true; `.js` importing `./helper.ts` true; `.js` importing `./dir` resolving to `dir/index.ts` true; `.js` importing `.ts` two hops away through a `.js` true; `.js` with only `.js` deps or only npm imports false | `transpileTypeScriptToCachedMjs/unit.test.ts` |
| Unit | A `.js` entry importing a `.ts` helper transpiles, runs, and its cache invalidates when the helper changes | `transpileTypeScriptToCachedMjs/unit.test.ts` |
| Unit | `resolveImportable` loads a `.js` default export that calls a relative `.ts` helper. Existing R1 (plain `.js`) still writes no transpile cache | `resolveImportable/unit.test.ts` |
| E2E | A lump with `config.js` that imports `../../helpers/<name>/index.ts` runs and pushes its marker commit | `e2e/ts-config-scenarios.test.ts` (new TS-S10) |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/examples/building-blocks.md` (shared helpers sentence) | Helpers in `.lumpcode/helpers/` may be `.ts` and imported from `config.ts`, `config.js`, or a `.js` hook module |

## Acceptance criteria

1. A lump whose `config.js` imports a relative `.ts` helper loads under `run` and `start`, with no `ERR_UNKNOWN_FILE_EXTENSION`.
2. A `.js` module referenced from `config.json` that imports a `.ts` helper loads.
3. Editing only the `.ts` helper changes behavior on the next load without touching `config.js`.
4. A plain `.js` config with no `.ts` in its graph creates no entry under `.lumpcode/.cache/transpile/`.
5. Only `needsTypeScriptTranspile` decides whether a module is transpiled; `resolveImportable` does not scan imports itself.
