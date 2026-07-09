# PRD: `pollUntil` — deadline polling util

| Field | Value |
| --- | --- |
| **Backlog** | `pollUntil` (priority 1) |
| **Status** | Pending implementation |
| **Package** | `packages/apps/cli` only |

## Problem statement and repeated pattern

Several CLI modules independently implement the same **deadline polling loop**:

1. Compute `deadline = Date.now() + timeoutMs`.
2. `while (Date.now() < deadline)` call an async predicate; if it succeeds, return early.
3. `await` a fixed-interval sleep (`setTimeout` / local `sleep` helper).
4. On timeout, return `failure(...)`, throw `Error`, or fall through to a caller-specific timeout path.

The skeleton is identical; only the predicate, interval, timeout message, and success/timeout handling differ.

### Call sites today

| Location | Interval | Timeout | Predicate | Timeout behavior |
| --- | --- | --- | --- | --- |
| `commands/stop/main.ts` (force path, ~94–107) | 50 ms | 5 s | `!isProcessAlive(pid, { onProbeError: 'dead' })` | `failure({ messages: [...] })` |
| `commands/stop/main.ts` (SIGTERM path, ~134–147) | 50 ms | 5 s | same as force path | `failure({ messages: [...] })` |
| `testing/waitForDaemonPidFile.ts` (`waitForPath`) | 25 ms | caller | `fs.access(filePath)` succeeds | `throw new Error(...)` |
| `e2e/harness/daemonHelpers.ts` (`waitForPath`) | 100 ms | 60 s default | `fs.access(filePath)` succeeds | `throw new Error(...)` |
| `e2e/harness/daemonHelpers.ts` (`waitForDaemonIdle`) | 100 ms | 120 s default | `readDaemonMeta` → `busy !== true` | `throw new Error(...)` |
| `e2e/harness/markerAssertions.ts` (`waitForRemoteMarker`) | 200 ms | 90 s default | `expectMarkerOnRemote` does not throw | `throw new Error(...)` |
| `commands/stop/unit.test.ts` (~182–196, ~302+) | 25 ms | 5 s | JSON ready-file has ≥2 child PIDs | `throw new Error(...)` |
| `utils/killProcessTree/unit.test.ts` (`waitForPidGone`, ~17–25) | 50 ms | 5 s default | `!isProcessAlive(pid)` | `throw new Error(...)` |

`commands/stop/main.ts` also defines a module-local `sleep` helper used only by these two loops.

This duplication makes interval/deadline bugs easy to introduce (copy-paste drift) and obscures the intent of “wait until condition or timeout.”

## Goals

1. Add `packages/apps/cli/src/utils/pollUntil/` with a single exported function that implements the shared loop.
2. Refactor **all** call sites listed above to use `pollUntil`, preserving existing timeouts, intervals, and outward behavior (same success paths, same error strings where operators/tests depend on them).
3. Achieve **net line reduction** across `packages/apps/cli` (production + test + e2e harness code), excluding the new util’s `unit.test.ts`.
4. Add focused unit tests for `pollUntil` (success before deadline, timeout, async predicate, custom `timeoutMessage`).

## Non-goals

- Changing timeout durations or poll intervals (behavior-preserving refactor only).
- Replacing event-based waiting (`child.once('close', …)` in `waitForChildExitAfterStop`) — only the `while (Date.now() < deadline)` pattern.
- Moving the util to `@lumpcode/core` (CLI-only consumers today).
- Adding FIFO queues, exponential backoff, or abort signals (v1 is fixed-interval polling only).
- A separate `sleep` util unless another abstraction backlog item covers it.

## Proposed util API

**Directory:** `packages/apps/cli/src/utils/pollUntil/`

```typescript
import type { Failure, Success } from '@lumpcode/core';

export async function pollUntil(input: {
    /** Wall-clock budget from the start of the call. */
    timeoutMs: number;
    /** Delay between predicate attempts after the first. */
    intervalMs: number;
    /** Return `true` when the waited-for condition is satisfied. */
    until: () => boolean | Promise<boolean>;
    /** Message for `failure()` when the deadline elapses; default: `Timed out after ${timeoutMs}ms`. */
    timeoutMessage?: string;
}): Promise<Success<void> | Failure<string>>;
```

### Semantics

- Evaluate `until()` immediately (no initial sleep). If it returns `true`, return `success(undefined)` (or `success()` per project convention).
- While `Date.now() < start + timeoutMs`, on `false`/`falsy`, `await` `intervalMs`, then re-evaluate.
- When the deadline passes without `until()` returning `true`, return `failure(input.timeoutMessage ?? \`Timed out after ${input.timeoutMs}ms\`)`.
- Do **not** swallow errors thrown by `until()` — let them propagate (callers that catch internally, e.g. `fs.access` in `waitForPath`, keep their try/catch inside the `until` callback).

### Caller adaptation patterns

**`stop` handler** (returns `Failure<{ messages }>`):

```typescript
const exited = await pollUntil({
    timeoutMs: 5000,
    intervalMs: 50,
    until: () => !isProcessAlive(pid, { onProbeError: 'dead' }),
    timeoutMessage: `Force-killed pid ${pid} but it did not exit within 5s. PID file left at ${pidFilePath}.`,
});
if (exited.success) {
    // unlink artifacts + return success messages (unchanged)
}
return failure({ messages: [exited.data] });
```

**Throw-on-timeout helpers** (`waitForPath`, e2e helpers, test helpers):

```typescript
const result = await pollUntil({ timeoutMs, intervalMs, until, timeoutMessage: `Timed out waiting for ${filePath}` });
if (!result.success) throw new Error(result.data);
```

## Affected files

### Add

| File | Purpose |
| --- | --- |
| `packages/apps/cli/src/utils/pollUntil/main.ts` | Implementation |
| `packages/apps/cli/src/utils/pollUntil/index.ts` | Re-export |
| `packages/apps/cli/src/utils/pollUntil/unit.test.ts` | Vitest coverage |

### Modify

| File | Change |
| --- | --- |
| `packages/apps/cli/src/utils/index.ts` | Barrel-export `pollUntil` |
| `packages/apps/cli/src/commands/stop/main.ts` | Replace both polling loops + remove local `sleep` |
| `packages/apps/cli/src/testing/waitForDaemonPidFile.ts` | Replace private `waitForPath` with `pollUntil` |
| `packages/apps/cli/src/e2e/harness/daemonHelpers.ts` | Refactor `waitForPath`, `waitForDaemonIdle` |
| `packages/apps/cli/src/e2e/harness/markerAssertions.ts` | Refactor `waitForRemoteMarker` loop |
| `packages/apps/cli/src/commands/stop/unit.test.ts` | Refactor ready-file polling loops |
| `packages/apps/cli/src/utils/killProcessTree/unit.test.ts` | Refactor `waitForPidGone` (+ remove local `sleep` if unused) |

## Acceptance criteria

### Behavior

- [ ] `lumpcode stop` force and graceful paths behave as before (same success messages, same timeout failure copy, same artifact cleanup).
- [ ] `waitForDaemonPidFile` / `waitForDaemonMetaFile` still throw with labels in the message on timeout.
- [ ] E2E helpers (`waitForPath`, `waitForDaemonIdle`, `waitForRemoteMarker`) preserve default timeouts and error text shape.
- [ ] Existing unit and E2E tests pass without changing asserted timeout values.

### `pollUntil` unit tests

- [ ] Resolves success when `until` returns `true` on the first call (no unnecessary delay).
- [ ] Resolves success when `until` becomes `true` after one or more intervals (use fake timers or very small `intervalMs` in test).
- [ ] Returns `failure` with default message when deadline elapses.
- [ ] Returns `failure` with custom `timeoutMessage` when provided.
- [ ] Propagates errors thrown inside `until` (does not convert to timeout failure).
- [ ] Supports async `until` (e.g. `await fs.access(...)` wrapped in try/catch returning `false`).

### Line count

- [ ] **Net reduction:** After refactor, total non-test lines removed from affected call sites minus lines added in `main.ts` + `index.ts` + barrel export is **≥ 10 lines** (target ~15–20 based on scan).
- [ ] Measure with `git diff --numstat` on `packages/apps/cli` excluding `utils/pollUntil/unit.test.ts`.

### Conventions

- [ ] Util layout matches CLI convention: `main.ts` + `index.ts`, exported from `utils/index.ts`.
- [ ] Function uses a single destructured object argument; typed with `Success` / `Failure` from `@lumpcode/core`.
- [ ] No new nested util subdirectories.

## Implementation notes

- Prefer importing `pollUntil` from the `../../utils` barrel in commands and from `../pollUntil` or barrel in sibling utils/tests — match surrounding file style.
- `stop/main.ts` duplicate loops differ only in success/failure message strings; share one `pollUntil` call shape and branch on `force` only for messages and pre-stop logic.
- `testing/waitForDaemonPidFile.ts` and `e2e/harness/daemonHelpers.ts` both had a `waitForPath` — after refactor, e2e may import from testing or both call `pollUntil` directly; avoid a third copy of the loop.
- Vitest fake timers (`vi.useFakeTimers` + `vi.advanceTimersByTimeAsync`) are appropriate for fast `pollUntil` tests without real sleeps.

## dependsOn

None. No existing backlog or DONE util is a prerequisite.
