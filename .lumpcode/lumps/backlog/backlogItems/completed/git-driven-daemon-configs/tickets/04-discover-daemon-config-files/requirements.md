# Requirements: 04 discover considered daemon files

Global contract: [`../../requirements.md`](../../requirements.md) (Repo layout; `discoveryBranch`; Git read; Considered set).

## Standalone value

Given a cwd and expanded-primary list, return the considered winners (and log drop reasons). Callers can unit-test with a real git repo and `origin/*` refs. Supervise does not call this yet.

## In scope

- Util `packages/apps/cli/src/utils/discoverDaemonConfigFiles/`.
- Read **only** `refs/remotes/origin/<effectiveDiscoveryBranch>` (ls-tree + show). No cwd, `HEAD`, or local-branch fallback. No `refreshCommand`.
- Top-level `.lumpcode/daemons/<stem>.{json,yml,yaml}` only; ignore nested / other names.
- Parse via ticket 03 schema; consider iff `discoveryBranch === effectiveDiscoveryBranch` of the origin ref the file was read from.
- Same stem, two extensions on one branch: neither, log.
- Same `daemonId` on two expanded primaries: first in caller’s expand order wins (caller passes `expandPrimaryBranches` result); extras log, snapshot still succeeds.
- Invalid parse/schema: log, drop that file.
- Missing `origin/<effectiveDiscoveryBranch>`: skip that branch, warn, do not fail the whole result.
- Caller supplies expanded primaries and cwd. This util does **not** fetch or take `gitCommonDirLock`.
- Result entries use `effectiveDiscoveryBranch` (not a separate `scanBranch` field). Same string as `DedicatedLumpLine.effectiveDiscoveryBranch` and the `scanBranch` arg to `discoverDedicatedLumpsForScanBranch`.

## Out of scope

- Fetch, lock, 5 min due loop, `launchStartDaemon` / `stopOneDaemon`.
- Shared vs dedicated (caller decides whether to invoke).
- Renaming `discoverDedicatedLumpsForScanBranch`.

## Acceptance

- [ ] File on `feat/a` with `discoveryBranch: "feat/a"` is considered when scanning `feat/a`; same file with `discoveryBranch: "dev"` is not.
- [ ] Two extensions / two-branch id contest / ignore README match the requirements tables.
- [ ] No second hash or schema implementation (use `daemonConfigFile`).
- [ ] Considered output uses `effectiveDiscoveryBranch`, aligned with `LumpLine` / `DedicatedLumpLine` on `dev`.
