# writeDaemonArtifacts

## Problem / repeated pattern

Daemon runtime identity is two files under `~/.lumpcode/daemons/`: a text PID file and a trailing-newline JSON meta file. Production already owns this sequence as a **private** helper inside `commands/start/main.ts` (`writeDaemonArtifacts`: `mkdir` daemons dir → write PID → `writeJsonFile` meta → on failure unlink PID and return `Failure`). Unit tests re-copy the same multi-step block whenever they need a “daemon is present” fixture without going through `start`:

1. `fs.mkdir(daemonsDir | dirname(pidPath), { recursive: true })`
2. `fs.writeFile(pidPath, String(pid)…)`
3. `writeJsonFile({ filePath: metaPath, data: metaPayload, trailingNewline: true })`

That drift already shows up as newline/`utf8` differences and duplicated try/cleanup only on the production path.

### Where it appears today

| Location | Form today |
| --- | --- |
| `commands/start/main.ts:125-145` | Private `writeDaemonArtifacts` (production writer at start foreground) |
| `commands/start/main.ts:464-472` | Sole production call site |
| `utils/listRunningProjectDaemons/unit.test.ts:28-41` | Inline pid + meta for new-style global |
| `utils/listRunningProjectDaemons/unit.test.ts:52-61` | Inline pid + meta for legacy bare global |
| `commands/daemon-status/unit.test.ts:77-82` | Inline stale pid `999999999` + meta |
| `commands/stop/unit.test.ts:177-187` | Inside `spawnSigtermIgnorantDaemon` (mid-run describe) |
| `commands/stop/unit.test.ts:487-497` | Duplicate `spawnSigtermIgnorantDaemon` (ST describe) |

## Classification

util — production call site in `commands/start` plus mixed unit-test fixtures.

Target file(s):
- `packages/apps/cli/src/utils/writeDaemonArtifacts/main.ts`
- `packages/apps/cli/src/utils/writeDaemonArtifacts/index.ts`
- `packages/apps/cli/src/utils/writeDaemonArtifacts/unit.test.ts`
- Barrel-export from `packages/apps/cli/src/utils/index.ts`

## Fully typed definition

```typescript
import * as fs from 'node:fs/promises';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { writeJsonFile } from '../writeJsonFile';

export type WriteDaemonArtifactsInput = {
    daemonsDir: string;
    pidFilePath: string;
    metaFilePath: string;
    /** JSON body written with `trailingNewline: true` (same as today’s start writer). */
    metaPayload: Record<string, unknown>;
    /**
     * PID file contents. Default: `process.pid`.
     * Written via `String(pid)` with no forced trailing newline (matches start today;
     * `readDaemonPidIfAlive` / callers already `.trim()`).
     */
    pid?: number | string;
};

/**
 * Ensures `daemonsDir` exists, writes the PID file, then writes meta JSON.
 * On any write failure after the PID file is created, best-effort unlinks the PID
 * file and returns `Failure` with the error message (start wraps into `{ messages }`).
 */
export async function writeDaemonArtifacts(
    input: WriteDaemonArtifactsInput,
): Promise<Success<void> | Failure<string>> {
    const {
        daemonsDir,
        pidFilePath,
        metaFilePath,
        metaPayload,
        pid = process.pid,
    } = input;
    await fs.mkdir(daemonsDir, { recursive: true });
    try {
        await fs.writeFile(pidFilePath, String(pid), 'utf8');
        const metaWrite = await writeJsonFile({
            filePath: metaFilePath,
            data: metaPayload,
            trailingNewline: true,
        });
        if (!metaWrite.success) {
            throw new Error(metaWrite.data);
        }
    } catch (e) {
        await fs.unlink(pidFilePath).catch(() => {});
        return failure(e instanceof Error ? e.message : String(e));
    }
    return success(undefined);
}
```

## Before -> after example

```typescript
// Before (listRunningProjectDaemons / daemon-status / stop spawn helper)
await fs.mkdir(daemonsDir, { recursive: true });
await fs.writeFile(pidPath, '999999999\n', 'utf8');
await writeJsonFile({
    filePath: metaPath,
    data: { cronSetup: '0 * * * *' },
    trailingNewline: true,
});

// After
const result = await writeDaemonArtifacts({
    daemonsDir,
    pidFilePath: pidPath,
    metaFilePath: metaPath,
    pid: 999999999,
    metaPayload: { cronSetup: '0 * * * *' },
});
expect(result.success).toBe(true);

// Before (commands/start/main.ts private helper + call)
const writeArtifactsResult = await writeDaemonArtifacts({ … }); // local fn
if (!writeArtifactsResult.success) {
    return writeArtifactsResult; // Failure<{ messages: string[] }>
}

// After (import from utils; adapt Failure<string> at the command boundary)
const writeArtifactsResult = await writeDaemonArtifacts({
    daemonsDir,
    pidFilePath,
    metaFilePath,
    metaPayload,
});
if (!writeArtifactsResult.success) {
    return failure({
        messages: [`Could not write daemon artifacts: ${writeArtifactsResult.data}`],
    });
}
```

## Affected call sites

- `commands/start/main.ts:125-145` — delete private `writeDaemonArtifacts`; import util
- `commands/start/main.ts:464-472` — wrap `Failure<string>` into `{ messages }` as above (keep user-facing prefix)
- `utils/listRunningProjectDaemons/unit.test.ts:28-41` — replace inline pid+meta with util (new-style global paths)
- `utils/listRunningProjectDaemons/unit.test.ts:52-61` — same for legacy bare `<project>.daemon.*` paths
- `commands/daemon-status/unit.test.ts:77-82` — stale pid + meta fixture
- `commands/stop/unit.test.ts:177-187` and `:487-497` — both `spawnSigtermIgnorantDaemon` copies; keep spawn/poll logic local, delegate file writes to util (and prefer collapsing the duplicated helper into one shared local factory once both call the util)

## Estimated lines saved

~55 lines removed across start + listed tests, ~35 lines added in `writeDaemonArtifacts/main.ts` (+ tiny `index.ts`) → ~20 net saved (excluding `unit.test.ts`). Extra savings if stop’s two near-identical mid-run helper blocks are deduped after adopting the util.

## Non-goals

- Meta-only rewrites after a live `start` (e.g. stop’s `writeBusyMeta` / `writeInFlightMeta`, daemon-status D1/D2 `inFlightLumpCount` patches) — keep `writeJsonFile` on the existing meta path
- PID-only probes in `readDaemonPidIfAlive/unit.test.ts` / `resolveDaemonPaths/unit.test.ts` when no meta is written
- Changing `tryRemoveOwnDaemonArtifacts` / `createInFlightMetaUpdater` in start
- Path helpers (`daemonPidPath` / `daemonMetaPath` / `resolveDaemonPaths`) — callers still build paths
- Cross-package moves; `@lumpcode/core` unchanged
- Behavior change to on-disk PID/meta format beyond centralizing today’s start writer semantics

## Acceptance criteria

- [ ] New files at `packages/apps/cli/src/utils/writeDaemonArtifacts/{main.ts,index.ts,unit.test.ts}`; re-exported from `utils/index.ts`
- [ ] All listed call sites refactored to use it; private start copy removed
- [ ] Meaningful net line reduction across call sites (excluding util `unit.test.ts`)
- [ ] Unit tests cover: success writes pid + trailing-newline meta; default `pid` is `process.pid`; meta `writeJsonFile` failure unlinks pid and returns `Failure`; `daemonsDir` is created when missing
- [ ] `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` pass; only `packages/apps/cli` touched
