# runForegroundStart

## Problem / repeated pattern

Start-command unit tests launch one foreground tick the same way: build a handler with `makeStartHandler`, pass `waitForShutdownOverride` (usually `async () => {}`, sometimes a gate or an assertion callback), then call it with `foreground: true`, cron `*/5 * * * *` (the daemon default), and `arguments: {}`. Extra flags (`include`, `exclude`, `lumpName`, `maxParallelRun`, `daemonId`) are the only variation. The block is copied across four suites (about 50 call sites). `makeStartHandler` already exists; it does not supply the foreground option bag or the default shutdown override.

## Classification

test helper — every call site is a `commands/start/testing/*.unit.test.ts` file.

Target file(s):

- test helper (colocated): add `runForegroundStart` to `packages/apps/cli/src/commands/start/testing/testHelpers.ts` (that file is already the suite's helper module; no new test file)

## Fully typed definition

```typescript
import { command, defaultCronPattern, type Input } from '../main';

export function runForegroundStart(input: {
    deps: StartHandlerDeps;
    /** Merged after foreground + default cron, so callers can override either. */
    options?: Partial<Input['options']>;
    /**
     * Foreground tests must not block on SIGINT.
     * Omitted means an already-resolved shutdown (`async () => {}`).
     * Pass a gate or assertion callback when the test has to observe mid-tick state.
     */
    waitForShutdownOverride?: () => Promise<void>;
}): ReturnType<ReturnType<typeof command.handlerMaker>> {
    const {
        deps,
        options,
        waitForShutdownOverride = async () => {},
    } = input;

    return makeStartHandler(deps, { waitForShutdownOverride })({
        options: {
            foreground: true,
            cronSetup: defaultCronPattern,
            ...options,
        },
        arguments: {},
    });
}
```

`defaultCronPattern` is already `'*/5 * * * *'`. Spreading `options` after those two keys keeps tests that omit `cronSetup` on the same schedule, and lets a caller override `cronSetup` when a test passes a different expression.

## Before -> after example

```typescript
// Before (commands/start/testing/multiDiscoveryBranches.unit.test.ts)
const result = await makeStartHandler(deps(), { waitForShutdownOverride: async () => {} })({
    options: { foreground: true, cronSetup: '*/5 * * * *' },
    arguments: {},
});

// After
const result = await runForegroundStart({ deps: deps() });
```

```typescript
// Before (shutdown gate + extra flag)
const result = await makeStartHandler(deps(), {
    waitForShutdownOverride: () => shutdownGate,
})({
    options: { include: 'sideA', foreground: true, cronSetup: '*/5 * * * *' },
    arguments: {},
});

// After
const result = await runForegroundStart({
    deps: deps(),
    waitForShutdownOverride: () => shutdownGate,
    options: { include: 'sideA' },
});
```

## Affected call sites

Replace each of these with `runForegroundStart`. Line ranges are the current `makeStartHandler(...)({ options, arguments })` expression, or the `const handle = makeStartHandler` plus the following `handle({...})` when those two statements are only the foreground invocation.

- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:64-67`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:84-87`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:98-101`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:125-128`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:169-174`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:201-204`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:218-221`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:239-242`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:278-281`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:346-349`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:380-383`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:449-452`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:534-537`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:592-595`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:624-627`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:653-656`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:687-690`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:729-736`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:809-812`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:857-860`
- `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts:900-903`
- `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts:92-97`
- `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts:147-152`
- `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts:207-212`
- `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts:262-267`
- `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts:342-347`
- `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts:403-408`
- `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts:440-445`
- `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts:469-474`
- `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts:504-509`
- `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts:534-543`
- `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts:560-565`
- `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts:584-589`
- `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts:609-614`
- `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts:644-647`
- `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts:122-127`
- `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts:156-167`
- `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts:186-196`
- `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts:216-224`
- `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts:238-245`
- `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts:275-280`
- `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts:351-356`
- `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts:390-395`
- `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts:425-444`
- `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts:472-477`
- `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts:533-538`
- `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts:564-573`
- `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts:632-637`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:62-66` (handle binding + call)
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:93-96`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:113-116`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:142-145`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:184-187`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:226-229`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:283-286`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:353-369`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:393-408` (same shape as 353)
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:473-476`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:521-524`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:543-546`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:559-562`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:583-586`
- `packages/apps/cli/src/commands/start/testing/general.unit.test.ts:610-612`

Tests that omit `waitForShutdownOverride` and then fail before the process would wait (for example multiDiscoveryBranches.unit.test.ts:98 and :624) still pass an immediate override through the default. That does not change the failure they assert, because the handler returns before shutdown.

## Estimated lines saved

About 50 call sites drop the repeated handler-plus-options block (roughly 5 lines each down to 1–3). ~150 lines removed at call sites, ~30 added in `testHelpers.ts` → ~120 net. No new test file.

## Non-goals

- Detached `start` calls that omit `foreground` (including `spawnFn` adoption tests and `superviseOnly`).
- `runLumpFromLumpName` spies, console spies, or lump fixture setup.
- Changing cron, flag defaults, or shutdown timing beyond routing the same override into `makeStartHandler`.
- A shared testing-barrel export. Callers already import `./testHelpers`.
- Any package outside `packages/apps/cli`.

## Acceptance criteria

- [ ] `runForegroundStart` lives in `packages/apps/cli/src/commands/start/testing/testHelpers.ts` and is imported by the four start suites that call it
- [ ] All listed call sites use it; extra CLI flags and custom shutdown callbacks stay as arguments
- [ ] Meaningful net line reduction across those call sites (no dedicated test file for the helper)
- [ ] `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` pass; only `packages/apps/cli` touched
