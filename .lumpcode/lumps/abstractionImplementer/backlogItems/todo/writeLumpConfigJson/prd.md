# PRD: `writeLumpConfigJson` — lump `config.json` scaffold util

| Field | Value |
| --- | --- |
| **Backlog** | `writeLumpConfigJson` (priority 5) |
| **Status** | Pending implementation |
| **Package** | `packages/apps/cli` only |

## Problem statement and repeated pattern

Many CLI tests and fixtures need a **runnable minimal lump** under `.lumpcode/lumps/<lumpName>/config.json`. The same JSON body is copy-pasted as a module-local `` const minimalLumpConfigJson = `…` `` heredoc in **eight** test files, and call sites hand-roll:

1. `path.join(..., 'lumps', lumpName)` (or `lumpDirPath` equivalent),
2. `fs.mkdir(lumpDir, { recursive: true })`,
3. `fs.writeFile(path.join(lumpDir, 'config.json'), …, 'utf-8')`.

`testing/multiBranchFixtures.ts` already exports `MINIMAL_RUNNABLE_LUMP_JSON` and `writeMinimalLump`, but most tests **do not import them** and instead duplicate the constant and write boilerplate. `commands/start/unit.test.ts` alone repeats the mkdir + `writeFile` trio **15** times.

The repeated skeleton:

```typescript
const minimalLumpConfigJson = `{ … same contextListJson + copilot/claude prompt … }`;

const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', lumpName);
await fs.mkdir(lumpDir, { recursive: true });
await fs.writeFile(path.join(lumpDir, 'config.json'), minimalLumpConfigJson, 'utf-8');
```

Variations only differ by `lumpName`, optional config overrides (e.g. `discoveryBranch`, `disabled`), and whether `projectRoot` or `localConfigFolderPath` is in scope.

### Call sites today

| Location | Duplication |
| --- | --- |
| `commands/start/unit.test.ts` | Local `minimalLumpConfigJson` constant + **15** mkdir/`writeFile` blocks |
| `commands/stop/unit.test.ts` | Local constant + inline write in `beforeEach` |
| `commands/restart/unit.test.ts` | Local constant + inline write in `beforeEach` |
| `commands/daemon-status/unit.test.ts` | Local constant + inline write in `beforeEach` |
| `commands/daemon-log/unit.test.ts` | Local constant + inline write in `beforeEach` |
| `utils/validateDaemonLaunch/unit.test.ts` | Local constant + one-off write |
| `utils/resolveTargetLumpNames/unit.test.ts` | Local constant + **2** writes |
| `utils/discoverLoadableLumpNames/unit.test.ts` | Local constant + one-off write |
| `testing/multiBranchFixtures.ts` | `MINIMAL_RUNNABLE_LUMP_JSON` + `writeMinimalLump` (canonical today, but testing-only) |
| `utils/runLumpFromLumpName/unit.test.ts`, `commands/run/unit.test.ts`, `utils/discoverDedicatedLumpsForScanBranch/unit.test.ts`, `commands/start/unit.test.ts` (multi-branch cases) | Already call `writeMinimalLump` — migrate to util import |

`e2e/harness/createE2eProject.ts` has a separate `writeLumpConfigFile` with pretty-print and multi-format support; out of scope for this util (e2e keeps its helper).

## Goals

1. Add `packages/apps/cli/src/utils/writeLumpConfigJson/` as the **canonical** place for the default minimal runnable lump JSON object and a single async writer.
2. Export the default config object so tests can assert against it without local heredocs.
3. Refactor **all** duplicated constants and mkdir/`writeFile` blocks listed above to call `writeLumpConfigJson`.
4. Thin `testing/multiBranchFixtures.ts`: `writeMinimalLump` delegates to the util; `MINIMAL_RUNNABLE_LUMP_JSON` re-exports the util constant (preserve existing `testing` barrel exports for backward compatibility).
5. Achieve **net line reduction** across `packages/apps/cli` (excluding the new util's `unit.test.ts`).
6. Add focused unit tests for the util.

## Non-goals

- Loading or validating lump config (`getJsConfigFromLumpName`, `validateLumpJsonConfig`).
- Writing `config.js` / `config.ts` (transpile path stays elsewhere).
- Replacing `lump-create` scaffold templates or e2e `writeLumpConfigFile`.
- Moving the util to `@lumpcode/core`.
- Pretty-printed JSON (compact `JSON.stringify` is enough for tests).

## Proposed util API

**Directory:** `packages/apps/cli/src/utils/writeLumpConfigJson/`

```typescript
/** Default runnable lump used across CLI tests and fixtures. */
export const MINIMAL_RUNNABLE_LUMP_CONFIG = {
    contextListJson: { NAME: 'README' },
    prompt: { promptTemplate: 'E2E @{NAME}', command: 'copilot' },
} as const;

export type MinimalRunnableLumpConfig = typeof MINIMAL_RUNNABLE_LUMP_CONFIG;

export async function writeLumpConfigJson(input: {
    /** Parent of `lumps/` (directory containing `.lumpcode/`), or `.lumpcode/` itself. */
    localConfigFolderPath: string;
    lumpName: string;
    /** Shallow-merged over `MINIMAL_RUNNABLE_LUMP_CONFIG` before write. */
    configOverrides?: Record<string, unknown>;
}): Promise<string>;
```

### Semantics

- Resolve lump directory via existing `lumpDirPath({ localConfigFolderPath, lumpName })` (accept `localConfigFolderPath` whether caller passes `projectRoot/.lumpcode` or already-normalized `.lumpcode` path — same as `lumpDirPath` today).
- `await fs.mkdir(lumpDir, { recursive: true })`.
- Write `config.json` with `JSON.stringify({ ...MINIMAL_RUNNABLE_LUMP_CONFIG, ...configOverrides })` and `utf-8` encoding.
- Return the absolute `lumpDir` path.
- Propagate `fs` errors (no `Success`/`Failure` envelope — test/fixture helper; matches current `writeMinimalLump` behavior).

### Optional follow-up (not required for acceptance)

When `writeJsonFile` lands (backlog priority 2), switch the internal write to `writeJsonFile` without changing the public API.

## Affected files

### Add

| File | Purpose |
| --- | --- |
| `packages/apps/cli/src/utils/writeLumpConfigJson/main.ts` | Constant + `writeLumpConfigJson` |
| `packages/apps/cli/src/utils/writeLumpConfigJson/index.ts` | Re-export |
| `packages/apps/cli/src/utils/writeLumpConfigJson/unit.test.ts` | Vitest coverage |

### Modify

| File | Change |
| --- | --- |
| `packages/apps/cli/src/utils/index.ts` | Barrel-export `writeLumpConfigJson`, `MINIMAL_RUNNABLE_LUMP_CONFIG` |
| `testing/multiBranchFixtures.ts` | Remove local constant/body; re-export from util; `writeMinimalLump` delegates |
| `testing/index.ts` | Keep exporting `MINIMAL_RUNNABLE_LUMP_JSON` / `writeMinimalLump` (aliases to util) |
| `commands/start/unit.test.ts` | Remove `minimalLumpConfigJson`; replace mkdir/write blocks |
| `commands/stop/unit.test.ts` | Same |
| `commands/restart/unit.test.ts` | Same |
| `commands/daemon-status/unit.test.ts` | Same |
| `commands/daemon-log/unit.test.ts` | Same |
| `utils/validateDaemonLaunch/unit.test.ts` | Same |
| `utils/resolveTargetLumpNames/unit.test.ts` | Same |
| `utils/discoverLoadableLumpNames/unit.test.ts` | Same |
| Call sites already using `writeMinimalLump` | Switch import to util or keep testing barrel (either is fine if behavior unchanged) |

## Acceptance criteria

### Behavior

- [ ] All refactored tests pass without changing asserted lump behavior (same default `contextListJson` / `prompt` shape as today).
- [ ] `writeMinimalLump(projectRoot, lumpName, overrides)` from `testing` still works for existing imports (delegates to util).
- [ ] `MINIMAL_RUNNABLE_LUMP_JSON` name remains available from `testing` barrel (alias of `MINIMAL_RUNNABLE_LUMP_CONFIG`).

### `writeLumpConfigJson` unit tests

- [ ] Creates `config.json` under `.lumpcode/lumps/<lumpName>/` when given `localConfigFolderPath` pointing at `.lumpcode/`.
- [ ] Creates parent directories when the lump dir is missing.
- [ ] Written JSON equals `{ ...MINIMAL_RUNNABLE_LUMP_CONFIG, ...configOverrides }` for sample overrides (`discoveryBranch`, `disabled`).
- [ ] Returns the lump directory path.

### Line count

- [ ] **Net reduction:** Lines removed from affected call sites minus lines added in `main.ts` + `index.ts` + barrel export is **≥ 40 lines** (scan estimate ~80–120 lines removed, ~25–30 added).
- [ ] Measure with `git diff --numstat` on `packages/apps/cli` excluding `utils/writeLumpConfigJson/unit.test.ts`.

### Conventions

- [ ] Util layout: `main.ts` + `index.ts`, exported from `utils/index.ts`.
- [ ] Single destructured object argument; `function` declaration per project style.
- [ ] Reuse `lumpDirPath` — do not duplicate path join logic.

## dependsOn

Optional: `writeJsonFile` (priority 2) — internal write may adopt it later; not blocking.

## Implementation notes

- Prefer `localConfigFolderPath` in the API (not `projectRoot`) to match `lumpDirPath`, `getJsConfigFromLumpName`, and command injections. Callers with only `projectRoot` pass `path.join(projectRoot, '.lumpcode')`.
- When removing heredoc constants, delete the entire `` const minimalLumpConfigJson = `…` `` block including trailing newline — do not leave unused imports (`fs` may remain for other fixture writes).
- `commands/start/unit.test.ts` is the largest win; batch-replace the `lumpDir` + mkdir + writeFile pattern first to validate line-count target.
