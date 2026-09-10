# Requirements: shared mode no daemon

| Field | Value |
| --- | --- |
| **Backlog** | `shared-mode-no-daemon` · parent `shared-in-place-run` · priority **1** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli`. `@lumpcode/core` unchanged. No docs in this ticket. |

Umbrella: [parent requirements](../../requirements.md).

## Problem statement and motivation

`lumpcode start` in shared used to schedule ticks on a tree the author also edits (and, today, on a project copy). Shared is laptop lump development. The worker is dedicated-only.

## Goals

1. `start`, `start --superviseOnly`, and `restart` fail in shared with one code and one message.
2. `stop`, `stop --all`, `daemon-status`, and `daemon-log` still work (reap leftovers).
3. Dedicated start / tick unchanged.

## Non-goals

- In-place walk or review prompt.
- Failing start because of `workspaceStrategy` / `maxParallelRun` in shared (start already fails this code).
- Changing `assertDaemonStartAllowed` (pid/meta only).
- Docs / website.

## User stories / use cases

1. As an author on a laptop (`mode: shared`) — `lumpcode start` tells me to use a dedicated worker or `lumpcode run`.
2. As an operator — leftovers from an old shared daemon can still be `stop`ped.

## Proposed behavior and UX

| `data.code` | Commands | Message (exact) |
| --- | --- | --- |
| `sharedModeNoDaemon` | `start`, `start --superviseOnly`, `restart` | `lumpcode start is dedicated-only. Use a worker clone with mode: dedicated, or lumpcode run on this laptop.` |

Fail after merged local config is available, before discover / refresh / spawn.

`workspaceStrategy` and `maxParallelRun` have no effect on this refuse.

## Technical approach

| Concern | Owner | Non-owners |
| --- | --- | --- |
| Gate | `packages/apps/cli/src/utils/assertDedicatedDaemonRequired/` (`assertDedicatedDaemonRequired({ mode }) → Success<void> \| Failure<{ code: 'sharedModeNoDaemon'; message: string }>`) | `assertDaemonStartAllowed` |
| Callers | `commands/start` after merged local config (every path including `--superviseOnly`); `launchStartDaemon` (covers `restart`) | `stop`, `daemon-status`, `daemon-log` |

Invert shared `start` success tests (T7 / S1 / G7 / `--superviseOnly`). Discover / `refreshCommand` must not run when the gate fails.

## Testing strategy

| Area | Where | Proves |
| --- | --- | --- |
| Owner | `assertDedicatedDaemonRequired/unit.test.ts` | shared fails; dedicated succeeds |
| Start | `commands/start` (T7 / S1 / G7 / `--superviseOnly`) | `sharedModeNoDaemon`; discover/refresh not called |
| Restart | `commands/restart` | same code |
| Companions | existing stop / daemon-status tests | still succeed in shared |

## Acceptance criteria

1. Shared `start`, `start --superviseOnly`, and `restart` fail `sharedModeNoDaemon` with the exact message.
2. Dedicated start / tick unchanged.
3. `stop` / `daemon-status` still work in shared.
4. No second mode check outside `assertDedicatedDaemonRequired` and its named callers.
