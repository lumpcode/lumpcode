# Workspace locks

Path locks and the git-common-dir lock, phase 1 / phase 2 handoff (CLI only).

- **`workspacePathLock`**: single namespace per `path.resolve` (`workspace-path-locks/`); **`workspacePathBusy`** failure; manual `run` `lockMode: 'fail'`, daemon `wait` (15 min then same code + `reason: 'waitTimedOut'`; re-log every 30s); atomic `wx` only (no FIFO v1)
- **`run` / `start`** call **`runLumpFromLumpName`** (phase 1) → **`runLumpFromJsConfig`** (phase 2); tests may call `runLumpFromJsConfig` directly with `jsConfig`
- **Phase 1** (dedicated): `preflightDiscoveryBranchWithLock` → load config + disabled soft skip; checkout keeps lock into phase 2; worktree releases after validation (parallel agents across worktrees; shared-git mutations still serialized by `gitCommonDirLock`)
- **Phase 2**: `withWorkspaceLockHooks` — dedicated baseBranch preflight at setup; shared does not call `runProjectPreflight`. Checkout continuous hold; worktree hold execution through setup then release execution-path lock when setup fn returns (branch path lock remains)
- Phase-1 **`releaseLock`** handoff → adopted into `session.releaseExecutionPathLock` at **`runLumpFromJsConfig` entry**; `try/finally` + **`releaseWorkspaceLockSession`** releases on all early returns (including **`tooManyOpenBranches`**)
- Disabled lump soft skip in phase 1 must call **`releaseLock`** before return (phase 2 not invoked)
- **`--discoveryBranch`** on `run` / `lump-plan` / `lump-status` (not on `start`); **`resolveEffectiveDiscoveryBranch`** (discovery only, not `resolvedBaseBranch`); shared: `run` warn-and-ignore, inspect commands honor via `honorDiscoveryBranchOptInShared`
- **`discoverDedicatedLumpsForScanBranch`**: short-lived locked preflight per `scanBranch` with lock holder **`DISCOVERY_SCAN_LOCK_HOLDER`** (`__discovery__`); daemon tick re-runs phase 1 per lump
- `workspaceFileLock` is internal — barrel-export `workspacePathLock` only
- Force-killed daemons (`stop --force`) may leave path locks; next acquire removes stale locks when holder PID is dead — no stop-time lock cleanup
- Do not duplicate core planning in CLI for lock keys (no pre-run `getToDoContextList` or `branchFn`)
