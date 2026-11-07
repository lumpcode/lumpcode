# createSpyLogger

## Problem / repeated pattern

CLI unit tests build the same `@lumpcode/core` `Logger` double: `info`, `warn`, `error`, and `verbose` are `vi.fn()`, and `child` returns a logger. Eight suites copy that function (`createLogger` / `testLogger`). Two of them (`validateDaemonLaunch`, `discoverLoadableLumpNames`) also keep a `warnings: string[]` and push inside `warn`, then assert `logger.warnings`. `installDaemonProcessGuards` inlines the same five-method object three times (`child: vi.fn()`). `noopLogger` is a silent logger, so it cannot replace spies that assert `toHaveBeenCalled` or a warnings list.

The blocks are the same shape:

- `packages/apps/cli/src/utils/validateDaemonLaunch/unit.test.ts:20-33` — `createLogger()` plus `warnings`
- `packages/apps/cli/src/utils/discoverLoadableLumpNames/unit.test.ts:11-24` — same warnings variant
- `packages/apps/cli/src/utils/scoreDedicatedLumpLine/unit.test.ts:53-61`
- `packages/apps/cli/src/utils/resolveEffectiveDiscoveryBranch/unit.test.ts:17-25`
- `packages/apps/cli/src/utils/reconcileDaemonConfigFiles/unit.test.ts:32-40`
- `packages/apps/cli/src/utils/expandPrimaryBranches/unit.test.ts:17-25` — callers cast `logger.warn` to `vi.fn` and read `mock.calls`
- `packages/apps/cli/src/utils/discoverDaemonConfigFiles/unit.test.ts:14-22` — asserts `logger.warn` with `toHaveBeenCalledWith`
- `packages/apps/cli/src/utils/discoverDedicatedLumpsForScanBranch/unit.test.ts:21-29`
- `packages/apps/cli/src/utils/installProcessShutdown/unit.test.ts:5-13` — `testLogger()`
- `packages/apps/cli/src/utils/installDaemonProcessGuards/unit.test.ts:23-29`, `:43-49`, `:64-70` — inline objects

`child` is never called by these suites or by the production modules they exercise. Copies differ only in whether `child` returns `this`, a fresh logger, or `vi.fn()`, and whether `warn` records into an array. One helper can serve every assertion style: `warn` stays a `vi.fn` (so `mock.calls` / `toHaveBeenCalledWith` keep working) and also appends to `warnings`.

## Classification

test helper — every call site is a `*.unit.test.ts` file. Shared across util suites, so it lives in `src/testing`, not next to one command.

Target file(s):

- test helper (shared): `packages/apps/cli/src/testing/createSpyLogger.ts` (+ export in `packages/apps/cli/src/testing/index.ts`)
- no dedicated test file for the helper

## Fully typed definition

```typescript
import type { Logger } from '@lumpcode/core';
import { vi, type Mock } from 'vitest';

export type SpyLogger = Logger & {
    warnings: string[];
    info: Mock<(message: string) => void>;
    warn: Mock<(message: string) => void>;
    error: Mock<(message: string) => void>;
    verbose: Mock<(message: string) => void>;
};

/** Vitest Logger double. `warn` records into `warnings` and remains a mock. `child` returns this same logger (prefix ignored), matching `noopLogger`. */
export function createSpyLogger(): SpyLogger {
    const warnings: string[] = [];
    const logger: SpyLogger = {
        warnings,
        info: vi.fn(),
        warn: vi.fn((message: string) => {
            warnings.push(message);
        }),
        error: vi.fn(),
        verbose: vi.fn(),
        child: () => logger,
    };
    return logger;
}
```

`SpyLogger` must stay assignable to `Logger`. Do not add methods beyond `Logger` plus `warnings` and the mock method types.

## Before -> after example

```typescript
// Before (discoverDaemonConfigFiles/unit.test.ts)
function createLogger(): Logger {
    return {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        verbose: vi.fn(),
        child: () => createLogger(),
    };
}

// later
logger = createLogger();
expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('broken.json'));

// After
import { createSpyLogger } from '../../testing';

logger = createSpyLogger();
expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('broken.json'));
```

Warnings-array call sites drop the local recorder and read `logger.warnings` on the same return value:

```typescript
// Before
function createLogger(): Logger & { warnings: string[] } {
    const warnings: string[] = [];
    const logger: Logger & { warnings: string[] } = {
        warnings,
        info: vi.fn(),
        warn: (message: string) => {
            warnings.push(message);
        },
        error: vi.fn(),
        verbose: vi.fn(),
        child: () => logger,
    };
    return logger;
}
const logger = createLogger();
expect(logger.warnings).toEqual([expect.stringContaining('v0.0.9')]);

// After
const logger = createSpyLogger();
expect(logger.warnings).toEqual([expect.stringContaining('v0.0.9')]);
```

## Affected call sites

- `packages/apps/cli/src/utils/validateDaemonLaunch/unit.test.ts:20` — delete `createLogger`; `createLogger()` → `createSpyLogger()` (call sites around lines 71, 101, 127, 151, 172, 208). Keep asserting `logger.warnings`.
- `packages/apps/cli/src/utils/discoverLoadableLumpNames/unit.test.ts:11` — same warnings-array replacement (`createLogger()` at line 42).
- `packages/apps/cli/src/utils/scoreDedicatedLumpLine/unit.test.ts:53` — delete `createLogger`; calls at lines 59, 85, 112.
- `packages/apps/cli/src/utils/resolveEffectiveDiscoveryBranch/unit.test.ts:17` — delete `createLogger`; calls at lines 23, 73, 102, 130, 158, 187, 200, 238.
- `packages/apps/cli/src/utils/reconcileDaemonConfigFiles/unit.test.ts:32` — delete `createLogger`; calls at lines 38 and 224.
- `packages/apps/cli/src/utils/expandPrimaryBranches/unit.test.ts:17` — delete `createLogger`; calls at lines 23, 65, 88, 100, 133, 145, 178, 199, 235, 255. Leave the `(logger.warn as ReturnType<typeof vi.fn>).mock.calls` assertions, or narrow them to `logger.warn.mock.calls` now that `warn` is typed as `Mock`.
- `packages/apps/cli/src/utils/discoverDaemonConfigFiles/unit.test.ts:14` — delete `createLogger`; calls at lines 20 and 35. Keep `logger.warn` mock assertions.
- `packages/apps/cli/src/utils/discoverDedicatedLumpsForScanBranch/unit.test.ts:21` — delete `createLogger`; calls at lines 27, 85, 109, 137, 212, 237, 261, 332, 366, 387, 407, 428, 465.
- `packages/apps/cli/src/utils/installProcessShutdown/unit.test.ts:5` — delete `testLogger`; `testLogger()` → `createSpyLogger()`.
- `packages/apps/cli/src/utils/installDaemonProcessGuards/unit.test.ts:23`, `:43`, `:64` — replace each inline logger object with `createSpyLogger()`.

Import `createSpyLogger` from `../../testing` (the path those files already use for other testing helpers, or add that import).

## Estimated lines saved

~112 lines removed (eight local functions plus three inline objects), ~42 added (helper, barrel line, imports, and the three one-line `createSpyLogger()` calls that replace inline objects) → ~70 net saved. Test helpers do not get their own test file, so that figure includes the new helper module.

## Non-goals

- No production logger changes. `noopLogger` stays the silent logger.
- Do not rewrite the `...noopLogger` plus custom `warn` objects in `runLumpFromJsConfig/unit.test.ts` (they only override `warn` on the silent logger and collect into a local array for one test). That is a different, smaller pattern.
- Do not change what each test asserts. `warn` must remain a Vitest mock so existing `toHaveBeenCalled*` / `mock.calls` checks pass, and it must push every message so existing `logger.warnings` checks pass.
- `child` may ignore its prefix. Returning this logger is enough; these tests never call `child`.
- Behavior-preserving refactor only. No changes outside `packages/apps/cli`.

## Acceptance criteria

- [ ] New file at `packages/apps/cli/src/testing/createSpyLogger.ts`; `createSpyLogger` and `SpyLogger` re-exported from `packages/apps/cli/src/testing/index.ts`
- [ ] All listed call sites use `createSpyLogger()` and the local logger factories / inline objects are gone
- [ ] Meaningful net line reduction across those tests (no new test file for the helper)
- [ ] `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` pass; only `packages/apps/cli` touched
