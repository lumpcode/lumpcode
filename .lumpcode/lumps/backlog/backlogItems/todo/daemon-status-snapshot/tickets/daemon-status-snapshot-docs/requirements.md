# Requirements: Daemon status snapshot docs

| Field | Value |
| --- | --- |
| **Backlog** | `daemon-status-snapshot-docs` · priority **2** · ticket under `daemon-status-snapshot` |
| **Status** | Pending implementation |
| **Depends on** | `daemon-live-meta-context`, `daemon-status-read-snapshot` |
| **Packages** | `packages/apps/cli/DOCS/` only |

Global contract: [`../requirements.md`](../../requirements.md).

## Goals

1. Document **`lumpcode daemon-status`** snapshot JSON and human output per the parent contract.
2. Update daemon **meta file** table for live overlay fields.

## Non-goals

- Production code or tests.
- Website (`packages/apps/website`).
- `AGENTS.md` unless a one-line fact is required for agent memory.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/commands.md` | `daemon-status` section: `inFlightRuns`, `nextTickAt`, `tickPhase`, `localConfigStale`, `snapshotIncomplete`; note deprecated `inFlightLumpCount` on `--json` |
| `packages/apps/cli/DOCS/concepts.md` | `.daemon.meta.json` row: live overlay fields |

Describe behavior as **shipped** (target contract). Land when writer + reader are merged or about to merge.

## Acceptance criteria

1. Docs match parent `StatusData` / meta fields without contradicting `requirements.md`.
2. No claim that Lumpcode opens PRs or runs a dashboard.
