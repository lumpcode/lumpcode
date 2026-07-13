# readJsonFile

## Repeated pattern

Multiple CLI modules independently implemented the same two-step flow for JSON config files:

1. `fs.readFile(path, 'utf8')` inside `try/catch`, branching on `nodeErrnoCode(error) === 'ENOENT'` (fail with a custom message, return `undefined`, or return a default object).
2. `JSON.parse(raw)` inside a second `try/catch`, returning `failure(\`Invalid JSON in …\`)` on syntax errors.

Call sites with this shape:

1. `utils/readJson/main.ts` — read + parse only (no ENOENT handling; `Failure<{ message }>` instead of `Failure<string>`).
2. `utils/readLocalConfig/main.ts` — ENOENT → project-setup hint; invalid JSON → failure.
3. `utils/readDaemonMeta/main.ts` — ENOENT → default meta; invalid JSON → failure.
4. `utils/workspaceFileLock/main.ts` — `readLockHolder` swallowed all read/parse errors.
5. `utils/transpileTypeScriptToCachedMjs/main.ts` — `readStoredMeta` returned `null` on any error.
6. `commands/login/main.ts` — `getAuthData` returned `null` on any error (implementation-only command).

Four additional callers (`getProjectName`, `getJsConfigFromLumpName`, `getContextStatusRecordFromLumpName`, `jsConfigToRunLumpInput`) imported the local `readJson` helper and duplicated the `{ message }` unwrap at each failure site.

## Why this name

`readJsonFile` names the full operation: read a UTF-8 file and parse JSON, with structured `Success` / `Failure<string>` results. It matches sibling core utils (`readHistoryFile`, `appendMissingGitignoreLines`) and replaces the CLI-local `readJson` name without implying schema validation (callers still run Zod or domain checks).

## Files changed

**Added (core)**

- `packages/core/src/utils/readJsonFile/main.ts`
- `packages/core/src/utils/readJsonFile/index.ts`
- `packages/core/src/utils/readJsonFile/unit.test.ts`
- `packages/core/src/utils/index.ts` (barrel export)

**Removed (cli)**

- `packages/apps/cli/src/utils/readJson/main.ts`
- `packages/apps/cli/src/utils/readJson/index.ts`
- `packages/apps/cli/src/utils/index.ts` (barrel export)

**Refactored (cli)**

- `utils/readLocalConfig/main.ts`
- `utils/readDaemonMeta/main.ts`
- `utils/getProjectName/main.ts`
- `utils/getJsConfigFromLumpName/main.ts`
- `utils/getContextStatusRecordFromLumpName/main.ts`
- `utils/jsConfigToRunLumpInput/main.ts`
- `utils/workspaceFileLock/main.ts`
- `utils/transpileTypeScriptToCachedMjs/main.ts`
- `commands/login/main.ts`

## Line count (approximate)

| | Lines |
|---|---|
| Removed from CLI (duplicate read/parse + `readJson` util) | ~91 |
| Added util (`main.ts` + `index.ts` + barrel) | ~42 |
| Added at refactored call sites (imports + `readJsonFile({ filePath, … })`) | ~46 |
| **Net reduction (excluding `unit.test.ts`)** | **~5** |

(From `git diff --numstat` on modified CLI/core files plus `wc -l` on the new util sources.)
