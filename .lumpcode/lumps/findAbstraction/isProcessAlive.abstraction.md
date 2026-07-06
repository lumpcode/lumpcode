# isProcessAlive

## Repeated pattern

After `nodeErrnoCode` centralized errno extraction, several CLI modules still duplicated the full **process liveness probe**: call `process.kill(pid, 0)` and interpret failures — `ESRCH` means the process is gone; other errors need caller-specific handling (rethrow, treat as alive, or treat as dead).

The same try/catch block appeared as private helpers and inline wait loops:

```typescript
try {
    process.kill(pid, 0);
    return true;
} catch (error: unknown) {
    const code = nodeErrnoCode(error);
    if (code === 'ESRCH') {
        return false;
    }
    throw error; // or return true / return false depending on caller
}
```

Call sites:

- `workspaceFileLock/main.ts` — stale lock cleanup (non-ESRCH → still alive)
- `killProcessTree/main.ts` — post-`taskkill` root check (non-ESRCH → throw)
- `readDaemonPidIfAlive/main.ts` — daemon PID file validation
- `commands/stop/main.ts` — two exit-wait loops (any probe error → process gone)

## Why this name

`isProcessAlive` names the operation directly: a signal-0 probe that returns a boolean. The optional `onProbeError` documents the three real caller policies without splitting into multiple similarly named helpers.

## Files changed

**Added (core)**

- `packages/core/src/utils/isProcessAlive/main.ts`
- `packages/core/src/utils/isProcessAlive/index.ts`
- `packages/core/src/utils/isProcessAlive/unit.test.ts`
- `packages/core/src/utils/index.ts` (barrel export)

**Refactored (cli)**

- `packages/apps/cli/src/utils/workspaceFileLock/main.ts`
- `packages/apps/cli/src/utils/killProcessTree/main.ts`
- `packages/apps/cli/src/utils/killProcessTree/unit.test.ts`
- `packages/apps/cli/src/utils/readDaemonPidIfAlive/main.ts`
- `packages/apps/cli/src/commands/stop/main.ts`

## Line count (approximate)

| | Lines |
|---|---|
| Removed from CLI call sites | ~34 |
| Added util + barrel (excl. unit tests) | ~20 |
| **Net reduction** | **~14** |

(Counts from `git diff` on modified files plus `wc -l` on the new util `main.ts` / `index.ts`.)
