# pathExists

## Repeated pattern

Several CLI modules checked whether a filesystem path is present using the same two shapes:

1. `fs.access(path).then(() => true).catch(() => false)` — a boolean existence probe without throwing.
2. `try { await fs.access(path); … } catch { … }` — the same probe inlined before reading or loading a file.

The pattern appeared when choosing lump config files, guarding project setup, resolving prompt templates and command modules, validating transpile cache output, and picking the first path in a search list. Core had the same `.then(() => true).catch(() => false)` idiom in `getCodeBasePaths` and `historyFile`.

## Why this name

`pathExists` names the boolean question callers ask: is this path accessible right now? It is generic, matches Node's `fs.access` semantics, and avoids coupling to files vs directories (unlike `fileExists`, which `resolveSpawnExecutable` uses synchronously for executables).

## Files changed

**Added (core)**

- `packages/core/src/utils/pathExists/main.ts`
- `packages/core/src/utils/pathExists/index.ts`
- `packages/core/src/utils/pathExists/unit.test.ts`
- `packages/core/src/utils/index.ts` (barrel export)

**Refactored (cli)**

- `utils/getProjectName/main.ts`
- `utils/getJsConfigFromLumpName/main.ts`
- `utils/getFirstExistingPath/main.ts`
- `utils/resolvePromptTemplateString/main.ts`
- `utils/jsConfigToRunLumpInput/main.ts`
- `utils/transpileTypeScriptToCachedMjs/main.ts`
- `commands/project-setup/main.ts`
- `testing/multiBranchFixtures.ts`

**Refactored (core, same pattern)**

- `helpers/getCodeBasePaths/main.ts`
- `utils/historyFile/main.ts`

## Line count (approximate)

| | Lines |
|---|---|
| Removed from CLI + core call sites (inline access probes, try/catch blocks, unused imports) | ~38 |
| Added util (`main.ts` + `index.ts` + barrel) | ~14 |
| Added at refactored call sites (`pathExists` imports) | ~8 |
| **Net reduction (excluding `unit.test.ts`)** | **~16** |
