# withAliveDaemon

## Problem / repeated pattern

Unit tests that need a live detached daemon for assertions copy the same multi-step block:

1. Build a `start` handler with `aliveDaemonSpawnFn`.
2. Call start with optional `cronSetup` / `daemonId` / `include` / deprecated `lumpName`.
3. Assert start succeeded.
4. Resolve daemon paths and `waitForDaemonPidFile`.
5. Run assertions (sometimes mutating meta / unlinking meta).
6. In `finally`, build a `stop` handler and stop (often with `force: true`).

`commands/start/testing/testHelpers.ts` already owns half of this (`runDetachedStart` + `stopDaemon`), but `daemon-status` inlines the full start/wait/stop graph four times, and start’s own overlap/conflict tests still hand-roll `try`/`finally` around those helpers.

### Where it appears today

| Location | Form today |
| --- | --- |
| `commands/daemon-status/unit.test.ts:96-139` | Inline start + wait + try list/status asserts + finally stop |
| `commands/daemon-status/unit.test.ts:143-189` (D1) | Same + rewrite meta `inFlightLumpCount: 2` + `force` stop |
| `commands/daemon-status/unit.test.ts:191-236` (D2) | Same + rewrite meta `inFlightLumpCount: 0` + `force` stop |
| `commands/daemon-status/unit.test.ts:238-280` | Same + `unlink(meta)` + `force` stop |
| `commands/start/testing/general.unit.test.ts:413-423` | `runDetachedStart` + try assert + finally stop alpha+global |
| `commands/start/testing/general.unit.test.ts:432-441` | `runDetachedStart` + try assert + finally `stopDaemon` |
| `commands/start/testing/general.unit.test.ts:454-467` | `runDetachedStart` + try assert + finally stop alpha+beta |

## Classification

test helper — every call site is unit-test-only (`*.unit.test.ts` / `commands/start/testing/`).

Target file(s):
- `packages/apps/cli/src/testing/withAliveDaemon.ts`
- Re-export from `packages/apps/cli/src/testing/index.ts`

## Fully typed definition

```typescript
import type { SpawnOptions } from 'node:child_process';

export type AliveDaemonTestPaths = {
    pidFilePath: string;
    metaFilePath: string;
    logFilePath: string;
    daemonId: string;
    projectName: string;
};

export async function withAliveDaemon(input: {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    /** Forwarded to start options when set. */
    daemonId?: string;
    /** @deprecated equivalent to start `--include=<name>` / runDetachedStart.lumpName */
    lumpName?: string;
    include?: string;
    cronSetup?: string;
    /** When true, stop uses `--force`. Default false. */
    forceStop?: boolean;
    /**
     * Extra daemon ids stopped in `finally` after the primary `daemonId`
     * (overlap tests that may have created a second daemon).
     */
    alsoStopDaemonIds?: string[];
    /**
     * Optional spawn override for start (defaults to `aliveDaemonSpawnFn`).
     * Typed loosely to match existing test doubles.
     */
    spawnFn?: (
        command: string,
        args?: readonly string[] | SpawnOptions,
        options?: SpawnOptions,
    ) => unknown;
    run: (paths: AliveDaemonTestPaths) => Promise<void>;
}): Promise<void> {
    // 1) start via startCommand.handlerMaker + aliveDaemonSpawnFn (or spawnFn)
    // 2) resolveDaemonPaths for resolved daemonId; waitForDaemonPidFile
    // 3) try { await input.run(paths) } finally {
    //      stop primary daemonId (forceStop → force: true)
    //      stop each alsoStopDaemonIds entry the same way
    //    }
}
```

Implementation notes:
- Prefer importing `command as startCommand` / `command as stopCommand` and `resolveDaemonPaths` the same way `runDetachedStart` / `stopDaemon` do today.
- May lift/reuse bodies from `commands/start/testing/testHelpers.ts` (`runDetachedStart`, `stopDaemon`) into this shared helper, then thin those start-local helpers to wrappers — optional, only if it shrinks lines without circular imports (`testing/` must not import from `commands/start/testing/`).
- Throw (or `expect(result.success).toBe(true)` then throw) when start fails, matching current test behavior.
- Do not swallow stop failures in `finally` unless today’s call site already ignores them (today’s sites `await` stop without catching).

## Before -> after example

```typescript
// Before (daemon-status D1)
const startHandle = startCommand.handlerMaker({
    projectRoot,
    localConfigFolderPath,
    globalConfigFolderPath,
    spawnFn: aliveDaemonSpawnFn,
});
const startResult = await startHandle({
    options: { cronSetup: '15 * * * *' },
    arguments: {},
});
expect(startResult.success).toBe(true);
const pidPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.pid`);
const metaPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.meta.json`);
await waitForDaemonPidFile(pidPath);
await writeJsonFile({
    filePath: metaPath,
    data: { cronSetup: '15 * * * *', workspaceStrategy: 'checkout', inFlightLumpCount: 2 },
    trailingNewline: true,
});
try {
    const statusResult = await makeDaemonStatusHandler()({
        options: { json: true, daemonId: 'global' },
        arguments: {},
    });
    // …asserts…
} finally {
    const stopHandle = stopCommand.handlerMaker({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
    });
    await stopHandle({ options: { force: true }, arguments: {} });
}

// After
await withAliveDaemon({
    projectRoot,
    localConfigFolderPath,
    globalConfigFolderPath,
    cronSetup: '15 * * * *',
    forceStop: true,
    run: async ({ metaFilePath }) => {
        await writeJsonFile({
            filePath: metaFilePath,
            data: { cronSetup: '15 * * * *', workspaceStrategy: 'checkout', inFlightLumpCount: 2 },
            trailingNewline: true,
        });
        const statusResult = await makeDaemonStatusHandler()({
            options: { json: true, daemonId: 'global' },
            arguments: {},
        });
        // …asserts…
    },
});
```

## Affected call sites

- `packages/apps/cli/src/commands/daemon-status/unit.test.ts:96-139` — inline start/wait/try/finally → `withAliveDaemon({ cronSetup: '15 * * * *', run })`; drop local imports of `startCommand` / `stopCommand` / `aliveDaemonSpawnFn` / `waitForDaemonPidFile` if unused elsewhere in the file
- `packages/apps/cli/src/commands/daemon-status/unit.test.ts:143-189` — D1 meta rewrite + force stop → `withAliveDaemon({ …, forceStop: true, run })`
- `packages/apps/cli/src/commands/daemon-status/unit.test.ts:191-236` — D2 idle inFlight → same helper, different meta payload in `run`
- `packages/apps/cli/src/commands/daemon-status/unit.test.ts:238-280` — unlink meta + force stop → `withAliveDaemon({ …, forceStop: true, run: async ({ metaFilePath }) => { await fs.unlink(metaFilePath); … } })`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:413-423` — try/`runDetachedStart`/finally dual stop → `withAliveDaemon({ …, lumpName: 'alpha', alsoStopDaemonIds: ['global'], run })`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:432-441` — conflict test try/finally → `withAliveDaemon({ …, run })`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:454-467` — two-filter try/finally → `withAliveDaemon({ …, lumpName: 'alpha', alsoStopDaemonIds: ['beta'], run })`

Optional follow-through (same PR if net-positive): thin `runDetachedStart` / `stopDaemon` in `commands/start/testing/testHelpers.ts` to call shared internals used by `withAliveDaemon`, without changing their public signatures for other start tests.

## Estimated lines saved

~90–110 lines removed across the 7 call sites (daemon-status blocks are ~40–45 lines each of orchestration; start sites lose ~6–10 try/finally lines each) minus ~45–55 lines for `withAliveDaemon.ts` + barrel export → **~40–55 net saved**. Excludes any dedicated test file for the helper (none required).

## Non-goals

- Not replacing stop/restart suites where stop/restart is the system under test (they must drive start/stop explicitly)
- Not e2e `runForegroundUntilMarkers` / `stopDaemonSafely` (different process model and CLI invocation)
- Not project fixture scaffolding (`createTempTestDirs`, bare remotes, `setupStartTestRepo`, companion beforeEach JSON/git setup)
- Not production `commands/*/main.ts` changes
- No changes outside `packages/apps/cli`

## Acceptance criteria

- [ ] New file at `packages/apps/cli/src/testing/withAliveDaemon.ts`, re-exported from `testing/index.ts`
- [ ] All listed call sites refactored to use it
- [ ] Meaningful net line reduction across call sites (no dedicated unit.test.ts for this helper)
- [ ] Behavior preserved: start still uses `aliveDaemonSpawnFn` by default; `forceStop` maps to stop `--force`; `alsoStopDaemonIds` stopped after the primary id; `run` receives resolved pid/meta/log paths
- [ ] `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` pass; only `packages/apps/cli` touched
