# Requirements: Daemon snapshot meta schema

| Field | Value |
| --- | --- |
| **Backlog** | `daemon-snapshot-meta-schema` · priority **2** · ticket under `daemon-status-snapshot` |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | `@lumpcode/cli` only |

Global contract: [`../../requirements.md`](../../requirements.md). This ticket owns **types and fingerprint only** (no daemon foreground writes).

## Goals

1. Extend **`readDaemonMeta`** Zod + `DaemonMeta` for `inFlightRuns`, `nextTickAt`, `tickPhase`, `localConfigFingerprint`.
2. Export **`DaemonInFlightRun`** type from the same module.
3. Update **`isDaemonMidRun`** to treat `inFlightRuns.length` like legacy count/`busy`.
4. Add **`localConfigFingerprint`** util (`fingerprintResolvedLocalConfig`).

## Non-goals

- `daemonLiveMeta` or `runForeground` changes.
- `daemon-status` command output.
- Lump-run hooks.

## Acceptance criteria

1. Planted meta JSON with live fields parses via `readDaemonMeta`.
2. `isDaemonMidRun` true for non-empty `inFlightRuns` or legacy count.
3. Fingerprint stable for identical `ResolvedProjectLocalConfig` (sorted-key JSON + SHA-256).
