# createWorkspaceFileLockApi

## Problem / repeated pattern

`workspacePathLock` and `gitCommonDirLock` are twin façades over the same
`workspaceFileLock` primitives. Each file copies the same five helpers, differing
only by a `WorkspaceFileLockSpec` constant and the public path field name
(`workspacePath` vs `gitCommonDir`):

1. `*LocksDirPath` → `workspaceLocksDirPath({ …, spec })`
2. `*LockFilePath` → `workspaceLockFilePath({ …, spec })`
3. `is*BusyError` → `isWorkspaceFileBusyError(data, spec.busyCode)`
4. `format*WaitMessage` → `formatWorkspaceFileWaitMessage({ …, spec })`
5. `acquire*` → `acquireWorkspaceFileLock({ …, spec })` (git-common-dir also
   resolves `gitCwd` → common dir first)

`cli.dupes.json` flags this as the largest CLI-only clone family (~56 duplicated
lines across two groups in those two `main.ts` files). A
spec-parameterized factory collapses the family without changing caller-facing
lock APIs.

Call sites of the duplicated façade bodies today:

- `packages/apps/cli/src/utils/workspacePathLock/main.ts:15–88` — full
  SPEC + path/busy/format/acquire stack
- `packages/apps/cli/src/utils/gitCommonDirLock/main.ts:15–102` — same stack
  (acquire wraps `resolveGitCommonDir` then the shared acquire)

External consumers already import only the public façade names
(`acquireWorkspacePathLock`, `isGitCommonDirBusyError`, …); those signatures
must stay stable.

## Classification

util — production call sites in `utils/workspacePathLock` and
`utils/gitCommonDirLock` (not test-only).

Target file(s):

- `packages/apps/cli/src/utils/createWorkspaceFileLockApi/main.ts`
- `packages/apps/cli/src/utils/createWorkspaceFileLockApi/index.ts`
- `packages/apps/cli/src/utils/createWorkspaceFileLockApi/unit.test.ts`

Do **not** re-export from `utils/index.ts` (same internal convention as
`workspaceFileLock`: only the public `workspacePathLock` / `gitCommonDirLock`
barrels are consumed elsewhere).

## Fully typed definition

```typescript
import type { Failure, Logger, Success } from '@lumpcode/core';

import {
    acquireWorkspaceFileLock,
    formatWorkspaceFileWaitMessage,
    isWorkspaceFileBusyError,
    workspaceLockFilePath,
    workspaceLocksDirPath,
    type ReleaseWorkspaceFileLockFn,
    type WorkspaceFileBusyError,
    type WorkspaceFileLockSpec,
    type WorkspaceLockHolder,
    type WorkspaceLockMode,
} from '../workspaceFileLock';

export type WorkspaceFileLockApi<S extends WorkspaceFileLockSpec> = {
    locksDirPath: (input: { globalConfigFolderPath: string }) => string;
    lockFilePath: (input: {
        globalConfigFolderPath: string;
        workspacePath: string;
    }) => string;
    isBusyError: (data: unknown) => data is WorkspaceFileBusyError<S>;
    formatWaitMessage: (input: {
        workspacePath: string;
        holder?: WorkspaceLockHolder;
    }) => string;
    acquire: (input: {
        globalConfigFolderPath: string;
        workspacePath: string;
        lumpName: string;
        mode: WorkspaceLockMode;
        projectName?: string;
        logger?: Logger;
    }) => Promise<Success<ReleaseWorkspaceFileLockFn> | Failure<WorkspaceFileBusyError<S>>>;
};

/**
 * Build the standard path / busy / wait / acquire helpers for one lock namespace.
 * Call sites keep thin typed wrappers (and git-common-dir resolve) on top.
 */
export function createWorkspaceFileLockApi<const S extends WorkspaceFileLockSpec>(
    spec: S,
): WorkspaceFileLockApi<S> {
    return {
        locksDirPath(input) {
            return workspaceLocksDirPath({
                globalConfigFolderPath: input.globalConfigFolderPath,
                spec,
            });
        },
        lockFilePath(input) {
            return workspaceLockFilePath({
                globalConfigFolderPath: input.globalConfigFolderPath,
                workspacePath: input.workspacePath,
                spec,
            });
        },
        isBusyError(data: unknown): data is WorkspaceFileBusyError<S> {
            return isWorkspaceFileBusyError(data, spec.busyCode);
        },
        formatWaitMessage(input) {
            return formatWorkspaceFileWaitMessage({
                spec,
                workspacePath: input.workspacePath,
                holder: input.holder,
            });
        },
        acquire(input) {
            return acquireWorkspaceFileLock({
                spec,
                globalConfigFolderPath: input.globalConfigFolderPath,
                workspacePath: input.workspacePath,
                lumpName: input.lumpName,
                mode: input.mode,
                projectName: input.projectName,
                logger: input.logger,
            });
        },
    };
}
```

Representative façade after refactor (`workspacePathLock`):

```typescript
const api = createWorkspaceFileLockApi(WORKSPACE_PATH_LOCK_SPEC);

export function workspacePathLocksDirPath(input: { globalConfigFolderPath: string }): string {
    return api.locksDirPath(input);
}

export function workspacePathLockFilePath(input: {
    globalConfigFolderPath: string;
    workspacePath: string;
}): string {
    return api.lockFilePath(input);
}

export function isWorkspacePathBusyError(data: unknown): data is WorkspacePathBusyError {
    return api.isBusyError(data);
}

export function formatWorkspacePathWaitMessage(input: {
    workspacePath: string;
    holder?: WorkspacePathLockHolder;
}): string {
    return api.formatWaitMessage(input);
}

export async function acquireWorkspacePathLock(input: {
    globalConfigFolderPath: string;
    workspacePath: string;
    lumpName: string;
    mode: WorkspacePathLockMode;
    projectName?: string;
    logger?: Logger;
}): Promise<Success<ReleaseWorkspacePathLockFn> | Failure<WorkspacePathBusyError>> {
    return api.acquire(input);
}
```

`gitCommonDirLock` keeps `resolveGitCommonDir` + `withGitCommonDirLock` locally;
`acquireGitCommonDirLock` resolves then calls `api.acquire({ workspacePath: commonDir, … })`.
Public path helpers map `gitCommonDir` → `api.lockFilePath({ workspacePath: gitCommonDir })`.

## Before -> after example

```typescript
// Before (duplicated in both façades)
export function workspacePathLocksDirPath(input: { globalConfigFolderPath: string }): string {
    return workspaceLocksDirPath({
        globalConfigFolderPath: input.globalConfigFolderPath,
        spec: WORKSPACE_PATH_LOCK_SPEC,
    });
}
export function isWorkspacePathBusyError(data: unknown): data is WorkspacePathBusyError {
    return isWorkspaceFileBusyError(data, WORKSPACE_PATH_LOCK_SPEC.busyCode);
}
// … lockFilePath, formatWaitMessage, acquire — same shape in gitCommonDirLock

// After
const api = createWorkspaceFileLockApi(WORKSPACE_PATH_LOCK_SPEC);
export const workspacePathLocksDirPath = (input: { globalConfigFolderPath: string }) =>
    api.locksDirPath(input);
export const isWorkspacePathBusyError = (data: unknown): data is WorkspacePathBusyError =>
    api.isBusyError(data);
```

## Affected call sites

- `packages/apps/cli/src/utils/workspacePathLock/main.ts` — replace inline
  path/busy/format/acquire bodies with `createWorkspaceFileLockApi(WORKSPACE_PATH_LOCK_SPEC)`;
  keep exported names and types
- `packages/apps/cli/src/utils/gitCommonDirLock/main.ts` — same for path/busy/format;
  `acquireGitCommonDirLock` still resolves common dir then `api.acquire`; keep
  `withGitCommonDirLock`
- No changes required at downstream importers (`runLumpFromJsConfig`,
  `makeGatedGitCommandFns`, `preflightDiscoveryBranchWithLock`, …) if public
  exports are preserved

## Estimated lines saved

~70 lines removed from the two façade `main.ts` files, ~45–55 added in
`createWorkspaceFileLockApi/main.ts` → ~15–25 net saved excluding
`unit.test.ts`. Primary win is one parameterized implementation instead of two
copy-pasted stacks (future lock namespaces stay one-liners).

## Non-goals

- Changing lock semantics, busy codes, wait messages, or holder payload shape
- Merging `workspacePathLock` / `gitCommonDirLock` into a single public module
- Barrel-exporting this factory or `workspaceFileLock` from `utils/index.ts`
- Moving lock core acquire/wait loop out of `workspaceFileLock`
- Cross-package changes (`@lumpcode/core`, recipes, etc.)

## Acceptance criteria

- [ ] `packages/apps/cli/src/utils/createWorkspaceFileLockApi/{main,index,unit.test}.ts` exist
- [ ] `workspacePathLock` and `gitCommonDirLock` use the factory; public export
      names and types unchanged
- [ ] Factory not re-exported from `utils/index.ts` (internal, like `workspaceFileLock`)
- [ ] Meaningful net line reduction across the two façades + new main (excluding
      `unit.test.ts`)
- [ ] Unit tests cover path helpers, `isBusyError` busyCode binding, and that
      `acquire` forwards `spec` / paths into `acquireWorkspaceFileLock` (mock or
      temp lock dir as sibling lock tests do)
- [ ] `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` pass; only
      `packages/apps/cli` touched
