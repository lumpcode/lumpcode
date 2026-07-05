# nodeErrnoCode

## Repeated pattern

Across `packages/apps/cli`, filesystem and process helpers catch `unknown` errors from Node APIs (`fs.readFile`, `fs.readdir`, `process.kill`, lock `open`, etc.) and branch on the Node-style `code` property (`ENOENT`, `ESRCH`, `EEXIST`, …). The same guard appeared in many places:

```typescript
const code =
    error && typeof error === 'object' && 'code' in error
        ? (error as NodeJS.ErrnoException).code
        : undefined;
```

Sometimes as a one-liner with the same shape. `readDaemonMeta/main.ts` even had a TODO noting this repetition.

## Why this name

`nodeErrnoCode` reads the errno-style `code` string Node attaches to system errors. It is generic (not Lumpcode-specific), lives in `@lumpcode/core`, and names exactly what callers need when handling missing files, dead PIDs, or lock contention.

## Files changed

**Added (core)**

- `packages/core/src/utils/nodeErrnoCode/main.ts`
- `packages/core/src/utils/nodeErrnoCode/index.ts`
- `packages/core/src/utils/nodeErrnoCode/unit.test.ts`
- `packages/core/src/utils/index.ts` (barrel export)

**Refactored (cli)**

- `packages/apps/cli/src/utils/validateCurrentLumpProjectRoot/main.ts`
- `packages/apps/cli/src/utils/readLocalConfig/main.ts`
- `packages/apps/cli/src/utils/readDaemonPidIfAlive/main.ts`
- `packages/apps/cli/src/utils/readDaemonMeta/main.ts`
- `packages/apps/cli/src/utils/listRunningProjectDaemons/main.ts`
- `packages/apps/cli/src/utils/killProcessTree/main.ts`
- `packages/apps/cli/src/utils/killProcessTree/unit.test.ts`
- `packages/apps/cli/src/utils/workspaceFileLock/main.ts`
- `packages/apps/cli/src/commands/project-setup/main.ts`
- `packages/apps/cli/src/commands/logout/main.ts`
- `packages/apps/cli/src/commands/stop/main.ts`

## Line count (approximate)

| | Lines |
|---|---|
| Removed from CLI call sites | ~70 |
| Added util + tests + barrel | ~33 |
| **Net reduction** | **~37** |

(Counts from `git diff` on modified files plus `wc -l` on the new util directory.)
