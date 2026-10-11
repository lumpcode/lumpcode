# Requirements: Daemon snapshot meta deprecation

| Field | Value |
| --- | --- |
| **Backlog** | `daemon-snapshot-meta-deprecation` · priority **3** · ticket under `daemon-status-snapshot` |
| **Status** | Pending implementation |
| **Depends on** | `daemon-live-meta-context`, `daemon-status-read-snapshot` |
| **Packages** | `@lumpcode/cli` only |

## Goals

1. Stop writing **`inFlightLumpCount`** to `.daemon.meta.json`.
2. Remove **`inFlightLumpCount`** from **`daemon-status`** `--json` `StatusData` (and human lines that only echo the count).
3. **`isDaemonMidRun`**: primary signal `inFlightRuns.length`; read fallback to legacy `inFlightLumpCount` / `busy` for old meta files on disk.

## Non-goals

- Changing snapshot field names or dashboard contract otherwise.
- `daemon-meta-desired-dedup`.

## Proposed behavior

- `daemonLiveMeta` writes overlay without count field.
- `stop` / `daemonBusy` tests updated for meta with `inFlightRuns` only.
- Docs: remove deprecated count from daemon-status JSON docs if still mentioned (`daemon-status-snapshot-docs` may need a tiny follow-up edit).

## Acceptance criteria

1. New daemon runs do not persist `inFlightLumpCount` key on meta.
2. `daemon-status --json` has no `inFlightLumpCount` property.
3. `stop` still refuses mid-run when meta has non-empty `inFlightRuns` or legacy count.
