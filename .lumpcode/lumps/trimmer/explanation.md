# Remove unused `formatWorkspacePathWaitMessage` from the CLI workspace path lock

Removed `formatWorkspacePathWaitMessage` from `packages/apps/cli/src/utils/workspacePathLock/main.ts`, along with the `WorkspacePathLockHolder` type that only its signature used and the `formatWorkspaceFileWaitMessage` import that only its body used.

The waiting message for workspace path locks is still produced inside `acquireWorkspaceFileLock` (`utils/workspaceFileLock/main.ts`), which calls `formatWorkspaceFileWaitMessage` directly with the lock spec. So log output does not change.

## Why it is unused

- `rg -w formatWorkspacePathWaitMessage` across the repo (excluding `node_modules` and `dist`) matches only its own definition. No caller, no test, no docs, no string reference.
- `rg -w WorkspacePathLockHolder` matches only the type definition and that function's parameter.
- `@lumpcode/cli` is an ncc-bundled binary with no library entry, and neither `cli-types` nor `cli-utils` re-exports `utils/workspacePathLock`. The function is not part of any published surface.
- `formatWorkspaceFileWaitMessage` keeps its other callers: `workspaceFileLock/main.ts` and `gitCommonDirLock/main.ts`.

## Checks

- `npm run test -w=@lumpcode/cli`: 161 files and 1212 tests passed, no type errors.
- `npm run build`: passed.
