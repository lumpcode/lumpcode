# PRD: `writeJsonFile` — atomic JSON file write util

| Field | Value |
| --- | --- |
| **Backlog** | `writeJsonFile` (priority 2) |
| **Status** | Pending implementation |
| **Package** | `packages/apps/cli` only |

## Problem statement and repeated pattern

`readJsonFile` already centralizes JSON reads with `Success` / `Failure` envelopes, `nodeErrnoCode` handling, and consistent error strings. Writes have no counterpart: callers hand-roll the same `fs.writeFile` + `JSON.stringify` combinations with small but meaningful variations:

1. **Compact vs pretty** — `JSON.stringify(data)` vs `JSON.stringify(data, null, 2)`.
2. **Trailing newline** — daemon meta and project scaffold files use `` `${JSON.stringify(...)}\n` ``; others omit it.
3. **Parent directory** — some callers `mkdir` the parent first (`login`, `project-setup`); others assume the directory exists.
4. **File mode** — `login` writes auth data with `mode: 0o600`.
5. **Error handling** — `updateContextStatusRecord` wraps write in try/catch and returns `failure(...)`; other sites let errors bubble or use ad hoc messages.

The repeated skeleton:

```typescript
await fs.mkdir(path.dirname(filePath), { recursive: true }); // sometimes
await fs.writeFile(
    filePath,
    pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data), // sometimes + '\n'
    { encoding: 'utf-8', mode: 0o600 }, // optional
);
```

### Production call sites today

| Location | Variation | Notes |
| --- | --- | --- |
| `utils/updateContextStatusRecord/main.ts` | pretty (`null, 2`), try/catch → `failure` | Highest boilerplate |
| `utils/transpileTypeScriptToCachedMjs/main.ts` | compact, `utf-8` | Cache meta sidecar |
| `commands/start/main.ts` (`writeDaemonArtifacts`, `updateDaemonMetaBusy`) | compact + trailing `\n` | Two writes to daemon meta |
| `commands/login/main.ts` (`saveAuthData`) | pretty + `mkdir` + `mode: 0o600` | Pairs with `readJsonFile` on read |
| `commands/project-setup/main.ts` | pretty + trailing `\n` for `project.json` and `local.json` | Inside `Promise.all` |
| `utils/workspaceFileLock/main.ts` | compact + trailing `\n` via `handle.writeFile` | Atomic `wx` open; shares serialization only |

### Test and fixture call sites

Dozens of unit tests, `testing/multiBranchFixtures.ts`, `testing/tsLumpFixtures.ts`, and `e2e/harness/createE2eProject.ts` repeat one-line or three-line `fs.writeFile(..., JSON.stringify(...))` blocks to seed `project.json`, `local.json`, lump `config.json`, and daemon meta fixtures. These are the same pattern without shared error handling.

This duplication drifts encoding (`utf8` vs `utf-8`), newline policy, and failure messages, and it leaves `readJsonFile` without a symmetric write API.

## Goals

1. Add `packages/apps/cli/src/utils/writeJsonFile/` as the write-side counterpart to `readJsonFile`.
2. Refactor all production call sites listed above to use `writeJsonFile` (or a shared `formatJsonFileContent` helper exported from the same module for `workspaceFileLock`'s `wx` handle path).
3. Refactor JSON fixture writes in `testing/`, `e2e/harness/`, and unit tests that seed JSON config files (not `JSON.stringify` used for git commit messages, CLI log output, or HTTP bodies).
4. Achieve **net line reduction** across `packages/apps/cli` (excluding the new util's `unit.test.ts`).
5. Add focused unit tests for `writeJsonFile`.

## Non-goals

- Replacing `readJsonFile` or changing its API.
- A generic `writeFile` wrapper for non-JSON content (`transpileTypeScriptToCachedMjs` `.mjs` output, PID text files, prompt templates).
- Atomic rename/write via temp file (callers that need `wx` exclusivity, e.g. `workspaceFileLock`, keep their open/create flow and only share JSON formatting).
- Moving the util to `@lumpcode/core`.
- Changing on-disk JSON formatting for existing files (behavior-preserving: same bytes as before for each call site).

## Proposed util API

**Directory:** `packages/apps/cli/src/utils/writeJsonFile/`

```typescript
import type { Failure, Success } from '@lumpcode/core';

export type WriteJsonFileInput = {
    filePath: string;
    data: unknown;
    /** When `true`, use 2-space indent; when a number, pass as `JSON.stringify` replacer space. Default: compact. */
    pretty?: boolean | number;
    /** Append `\n` after the JSON document. Default: `false`. */
    trailingNewline?: boolean;
    encoding?: BufferEncoding;
    /** When `true`, `mkdir` `path.dirname(filePath)` with `{ recursive: true }` before write. */
    mkdir?: boolean;
    mode?: number;
};

/** Pure formatter shared with callers that write via an open handle (e.g. workspace locks). */
export function formatJsonFileContent(input: Pick<WriteJsonFileInput, 'data' | 'pretty' | 'trailingNewline'>): string;

export async function writeJsonFile(
    input: WriteJsonFileInput,
): Promise<Success<void> | Failure<string>>;
```

### Semantics

- `formatJsonFileContent` returns the exact string `writeJsonFile` would persist (no I/O).
- `writeJsonFile` optionally creates the parent directory, then writes with `fs.writeFile`.
- On failure, return `failure(\`Cannot write ${filePath}: ${...}\`)` using the same `String(error)` style as `readJsonFile`.
- Do not catch and swallow errors beyond translating to `Failure`; callers that need throw-on-error can assert success in tests or check `.success`.
- Default encoding: `utf-8`.

### Caller adaptation examples

**`updateContextStatusRecord`** (replaces try/catch block):

```typescript
const writeResult = await writeJsonFile({
    filePath: contextStatusRecordPath({ projectRoot, lumpName }),
    data: nextContextStatusRecord,
    pretty: 2,
});
if (!writeResult.success) {
    return failure({ message: `Failed to update context status record file: ${writeResult.data}` });
}
```

**`login` `saveAuthData`**:

```typescript
await writeJsonFile({
    filePath: authFilePath,
    data: authData,
    pretty: true,
    mkdir: true,
    mode: 0o600,
});
// saveAuthData may keep `Promise<void>` and throw on failure, or check `.success` — preserve current behavior.
```

**`start` daemon meta**:

```typescript
await writeJsonFile({ filePath: metaFilePath, data: metaPayload, trailingNewline: true });
```

**`workspaceFileLock`** (format only):

```typescript
await handle.writeFile(formatJsonFileContent({ data: payload, trailingNewline: true }), 'utf8');
```

**Test fixture** (typical):

```typescript
await writeJsonFile({
    filePath: path.join(localConfigFolderPath, 'local.json'),
    data: { mode: 'dedicated', primaryBranch: 'main' },
});
```

## Affected files

### Add

| File | Purpose |
| --- | --- |
| `packages/apps/cli/src/utils/writeJsonFile/main.ts` | `formatJsonFileContent`, `writeJsonFile` |
| `packages/apps/cli/src/utils/writeJsonFile/index.ts` | Re-export |
| `packages/apps/cli/src/utils/writeJsonFile/unit.test.ts` | Vitest coverage |

### Modify (production)

| File | Change |
| --- | --- |
| `packages/apps/cli/src/utils/index.ts` | Barrel-export `writeJsonFile` |
| `packages/apps/cli/src/utils/updateContextStatusRecord/main.ts` | Use `writeJsonFile` |
| `packages/apps/cli/src/utils/transpileTypeScriptToCachedMjs/main.ts` | Use `writeJsonFile` for cache meta |
| `packages/apps/cli/src/utils/workspaceFileLock/main.ts` | Use `formatJsonFileContent` |
| `packages/apps/cli/src/commands/start/main.ts` | Daemon meta writes via `writeJsonFile` |
| `packages/apps/cli/src/commands/login/main.ts` | `saveAuthData` via `writeJsonFile` |
| `packages/apps/cli/src/commands/project-setup/main.ts` | Scaffold JSON files via `writeJsonFile` |

### Modify (tests and fixtures)

Refactor JSON file seeding (not git `-m` / HTTP / log JSON) in at least:

| File | Change |
| --- | --- |
| `packages/apps/cli/src/testing/multiBranchFixtures.ts` | Fixture writes |
| `packages/apps/cli/src/testing/tsLumpFixtures.ts` | Fixture writes |
| `packages/apps/cli/src/e2e/harness/createE2eProject.ts` | E2E project/lump JSON |
| Unit tests under `packages/apps/cli/src/utils/` and `commands/` that `writeFile` + `JSON.stringify` project/local/daemon meta fixtures | Use `writeJsonFile` |

Skip `.cjs` test children (`daemonForegroundChild.cjs`, etc.) unless a follow-up item covers CJS; they are out of scope for net line count in this PR.

## Acceptance criteria

### Behavior

- [ ] On-disk bytes for each refactored production path match pre-refactor output (same pretty/compact, same trailing newline policy, same file mode for auth).
- [ ] `updateContextStatusRecord` failure messages remain actionable and include the file path context.
- [ ] `readJsonFile` / `writeJsonFile` round-trip for `project.json`, `local.json`, daemon meta, and context status records in existing tests.
- [ ] All existing unit and E2E tests pass without changing asserted file contents.

### `writeJsonFile` unit tests

- [ ] Writes compact JSON by default.
- [ ] `pretty: true` / `pretty: 2` produces indented output.
- [ ] `trailingNewline: true` appends exactly one `\n`.
- [ ] `mkdir: true` creates missing parent directories.
- [ ] `mode` is forwarded to `fs.writeFile` when set.
- [ ] Returns `failure` when the parent path is missing and `mkdir` is not set.
- [ ] `formatJsonFileContent` output matches what `writeJsonFile` would write for the same options.

### Line count

- [ ] **Net reduction:** Lines removed from refactored call sites minus lines added in `main.ts`, `index.ts`, and barrel export is **≥ 15 lines** across `packages/apps/cli`, excluding `utils/writeJsonFile/unit.test.ts`.
- [ ] Measure with `git diff --numstat` on `packages/apps/cli` after the refactor.

### Conventions

- [ ] Util layout: `main.ts` + `index.ts`, exported from `utils/index.ts`.
- [ ] Single destructured object argument; `Success` / `Failure` from `@lumpcode/core`.
- [ ] Error string style aligned with `readJsonFile` (`Cannot write …` / `Cannot read …`).
- [ ] No nested util subdirectories.

## Implementation notes

- Import `writeJsonFile` from the `../../utils` barrel in commands; sibling utils may import from `../writeJsonFile` or the barrel — match surrounding file style.
- When a test helper currently ignores write errors, either keep that behavior (`writeJsonFile` + assert success) or document why — do not weaken production error handling.
- `project-setup` `Promise.all` can call `writeJsonFile` in parallel; ensure `mkdir: true` on both scaffold files or retain the outer `lumpcodeDir` mkdir — avoid redundant races.
- Prefer refactoring multi-line `writeFile` blocks in tests first for the largest per-site savings; single-line replacements are still required for consistency but count less toward net reduction.
- `login` `saveAuthData` returns `Promise<void>` today; either throw on `!writeResult.success` with the failure string or keep explicit check — preserve external behavior.

## dependsOn

None. `readJsonFile` already exists; this util is intentionally symmetric and independent of `pollUntil`.
