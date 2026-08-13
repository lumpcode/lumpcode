# writeDaemonMetaFixture

## Problem / repeated pattern

Unit tests that seed a daemon meta JSON file copy the same multi-step fixture write:

1. Call `writeJsonFile` with `filePath` pointing at a `.daemon.meta.json` path.
2. Pass a `data` object that almost always includes `cronSetup: '*/5 * * * *'` and `workspaceStrategy: 'checkout'` (sometimes overridden).
3. Optionally set `busy`, `inFlightLumpCount`, `daemonId`, `lumpName`, or unknown keys for strip/compat cases.
4. Often pass `trailingNewline: true` (daemon writers use a trailing newline).

`commands/stop/unit.test.ts` even defines the same local `writeBusyMeta` / `writeInFlightMeta` helpers twice (two describe blocks), each wrapping that skeleton.

### Where it appears today

| Location | Form today |
| --- | --- |
| `utils/readDaemonMeta/unit.test.ts:62-69` | Inline write with `busy: true` |
| `utils/readDaemonMeta/unit.test.ts:80-87` | Inline write with `busy: false` |
| `utils/readDaemonMeta/unit.test.ts:96-102` | Inline write idle (no busy) |
| `utils/readDaemonMeta/unit.test.ts:111-119` | Inline write + unknown keys (`agentPid`, `childPids`) |
| `utils/readDaemonMeta/unit.test.ts:134-141` | Inline write `inFlightLumpCount: 2`, `workspaceStrategy: 'worktree'` |
| `utils/readDaemonMeta/unit.test.ts:152-159` | Inline write legacy `busy: true` |
| `utils/listRunningProjectDaemons/unit.test.ts:34-41` | Inline write modern global meta (`daemonId`, worktree) |
| `utils/listRunningProjectDaemons/unit.test.ts:58-61` | Inline write legacy global meta |
| `commands/daemon-status/unit.test.ts:159-167` | Rewrite live meta with `inFlightLumpCount: 2` |
| `commands/daemon-status/unit.test.ts:207-215` | Rewrite live meta with `inFlightLumpCount: 0` |
| `commands/restart/unit.test.ts:178-186` | Seed mid-run meta so restart→stop refuses |
| `commands/stop/unit.test.ts:109-120` | Local `writeBusyMeta` (describe block 1) |
| `commands/stop/unit.test.ts:122-136` | Local `writeInFlightMeta` (describe block 1) |
| `commands/stop/unit.test.ts:179-187` | Inline meta inside `spawnSigtermIgnorantDaemon` (block 1) |
| `commands/stop/unit.test.ts:409-422` | Local `writeInFlightMeta` (describe block 2, duplicate) |
| `commands/stop/unit.test.ts:425-435` | Local `writeBusyMeta` (describe block 2, duplicate) |
| `commands/stop/unit.test.ts:489-497` | Inline meta inside second `spawnSigtermIgnorantDaemon` |
| `commands/stop/unit.test.ts:582-591` | Seed `--lumpName` daemon mid-run meta |

## Classification

test helper — every call site is unit-test-only (`*.unit.test.ts`).

Target file(s):
- `packages/apps/cli/src/testing/writeDaemonMetaFixture.ts`
- Re-export from `packages/apps/cli/src/testing/index.ts`

## Fully typed definition

```typescript
import { writeJsonFile } from '../utils/writeJsonFile';
import type { WorkspaceStrategy } from '../types/WorkspaceStrategy';

export type DaemonMetaFixtureFields = {
    daemonId?: string;
    cronSetup?: string;
    /** @deprecated Prefer include; kept for fixture realism. */
    lumpName?: string;
    include?: string[];
    exclude?: string[];
    maxParallelRun?: number;
    workspaceStrategy?: WorkspaceStrategy;
    busy?: boolean;
    inFlightLumpCount?: number;
} & Record<string, unknown>;

/**
 * Writes a daemon meta JSON fixture with the defaults used across CLI tests:
 * `cronSetup: '*/5 * * * *'`, `workspaceStrategy: 'checkout'`, `trailingNewline: true`.
 * Callers override via `meta` (spread after defaults). Throws if `writeJsonFile` fails.
 */
export async function writeDaemonMetaFixture(input: {
    filePath: string;
    meta?: DaemonMetaFixtureFields;
    trailingNewline?: boolean;
}): Promise<void> {
    const result = await writeJsonFile({
        filePath: input.filePath,
        data: {
            cronSetup: '*/5 * * * *',
            workspaceStrategy: 'checkout',
            ...input.meta,
        },
        trailingNewline: input.trailingNewline ?? true,
    });
    if (!result.success) {
        throw new Error(result.data);
    }
}
```

## Before -> after example

```typescript
// Before
await writeJsonFile({
    filePath: metaPath,
    data: {
        cronSetup: '*/5 * * * *',
        workspaceStrategy: 'checkout',
        inFlightLumpCount: 2,
    },
    trailingNewline: true,
});

// After
await writeDaemonMetaFixture({
    filePath: metaPath,
    meta: { inFlightLumpCount: 2 },
});
```

`stop/unit.test.ts` should delete both pairs of local `writeBusyMeta` / `writeInFlightMeta` and call `writeDaemonMetaFixture` directly (thin one-line local aliases are OK only if they still shrink net lines).

## Affected call sites

- `utils/readDaemonMeta/unit.test.ts:62-69` — busy true → `writeDaemonMetaFixture({ filePath, meta: { busy: true } })` (omit `trailingNewline` if the test currently omits it; default true is fine unless an assertion depends on no newline)
- `utils/readDaemonMeta/unit.test.ts:80-87` — busy false → `meta: { busy: false }`
- `utils/readDaemonMeta/unit.test.ts:96-102` — idle defaults only → `writeDaemonMetaFixture({ filePath })`
- `utils/readDaemonMeta/unit.test.ts:111-119` — unknown keys → `meta: { agentPid: 12345, childPids: [1, 2, 3] }`
- `utils/readDaemonMeta/unit.test.ts:134-141` — worktree + count → `meta: { workspaceStrategy: 'worktree', inFlightLumpCount: 2 }`
- `utils/readDaemonMeta/unit.test.ts:152-159` — legacy busy → `meta: { busy: true }`
- `utils/listRunningProjectDaemons/unit.test.ts:34-41` — `meta: { daemonId: 'global', workspaceStrategy: 'worktree' }`
- `utils/listRunningProjectDaemons/unit.test.ts:58-61` — defaults only (or empty `meta`)
- `commands/daemon-status/unit.test.ts:159-167` — preserve cron via `meta: { cronSetup: '15 * * * *', inFlightLumpCount: 2 }`
- `commands/daemon-status/unit.test.ts:207-215` — `meta: { cronSetup: '15 * * * *', inFlightLumpCount: 0 }`
- `commands/restart/unit.test.ts:178-186` — `meta: { inFlightLumpCount: 2 }`
- `commands/stop/unit.test.ts:109-136` — remove local helpers; call sites use `writeDaemonMetaFixture`
- `commands/stop/unit.test.ts:179-187` — inline idle meta → helper with `inFlightLumpCount: 0`
- `commands/stop/unit.test.ts:409-435` — remove duplicate local helpers in describe block 2
- `commands/stop/unit.test.ts:489-497` — same as first spawn helper
- `commands/stop/unit.test.ts:582-591` — `meta: { lumpName: 'alpha', inFlightLumpCount: 1 }`

## Estimated lines saved

~18 call sites shrink from ~7–9 lines to ~1–3 (~90–110 lines removed at sites), plus ~50 lines of duplicated local helpers in `stop/unit.test.ts` (overlap with site count — do not double-count). New helper ~35 lines. Conservative net: **~55–70 lines saved** (no dedicated test file for the helper).

## Non-goals

- Production daemon meta writers in `commands/start/main.ts` (`writeDaemonArtifacts` / live meta updates)
- Sites that intentionally omit `workspaceStrategy` to assert reader defaulting (e.g. `readDaemonMeta/unit.test.ts` case that writes only `{ cronSetup }` with no strategy) — leave those on raw `writeJsonFile`
- One-off meta shapes that do not share the default cron/strategy skeleton when forcing defaults would change the assertion
- Cross-package moves; no new util under `src/utils/`
- Dedicated unit.test.ts for this test helper

## Acceptance criteria

- [ ] New file at `packages/apps/cli/src/testing/writeDaemonMetaFixture.ts`; re-exported from `packages/apps/cli/src/testing/index.ts`
- [ ] All listed call sites refactored to use it; duplicated `writeBusyMeta` / `writeInFlightMeta` helpers removed from `stop/unit.test.ts`
- [ ] Meaningful net line reduction across call sites (no dedicated helper test file)
- [ ] `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` pass; only `packages/apps/cli` touched
