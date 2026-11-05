# Remove unused `formatGitCommonDirWaitMessage` from the CLI git common-dir lock

Removed `formatGitCommonDirWaitMessage` from `packages/apps/cli/src/utils/gitCommonDirLock/main.ts`, along with the `GitCommonDirLockHolder` type that only its signature used and the `formatWorkspaceFileWaitMessage` import that only its body used. `IDEAS.yaml` (`generic-lock-holder-label`) listed `GitCommonDirLockHolder` among the lock types; that mention is dropped so the idea names only types that exist.

The wait message for git common-dir locks is still produced inside `acquireWorkspaceFileLock` (`utils/workspaceFileLock/main.ts`), which calls `formatWorkspaceFileWaitMessage` directly with the lock spec. The actual lock payload type there is `WorkspaceLockHolder`. Log output does not change.

This is the same dead wrapper the previous trim removed from `workspacePathLock`.

## Why it is unused

- `rg -w formatGitCommonDirWaitMessage` across the repo (excluding `node_modules` and `dist`) matches only its own definition. No caller, no test, no docs, no string reference.
- `rg -w GitCommonDirLockHolder` matches only the type definition, that function's parameter, and the `IDEAS.yaml` prose.
- `@lumpcode/cli` is an ncc-bundled binary with no library entry, and `cli-types`, `cli-utils`, and `@lumpcode/recipes` do not reference `gitCommonDirLock`. Neither symbol is part of any published surface.
- `formatWorkspaceFileWaitMessage` keeps its caller in `workspaceFileLock/main.ts`.

## Checks

- `npm run test -w=@lumpcode/cli`: 161 files and 1211 tests passed, no type errors.
- `npm run build`: passed.
