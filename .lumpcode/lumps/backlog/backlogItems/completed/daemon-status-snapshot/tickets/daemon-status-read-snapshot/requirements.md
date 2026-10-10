# Requirements: Daemon status read snapshot

| Field | Value |
| --- | --- |
| **Backlog** | `daemon-status-read-snapshot` · priority **2** · ticket under `daemon-status-snapshot` |
| **Status** | Pending implementation |
| **Depends on** | `daemon-live-meta-context` |
| **Packages** | `@lumpcode/cli` only |

Global contract: [`../requirements.md`](../../requirements.md). This ticket owns **`daemon-status` read merge** and **`localConfigStale`**.

## Goals

1. Extend **`StatusData`** / `toStatusData` with snapshot fields and human lines.
2. Implement **Option A** read rules: always `inFlightRuns` when `running: true` and meta valid; **`snapshotIncomplete`** for legacy meta.
3. Compute **`localConfigStale`** at read time via **`localConfigFingerprint`** from the writer ticket (do not duplicate the util).

## Non-goals

- Daemon foreground writes (meta-schema / live-meta-core / live-meta-context tickets).
- Docs (`daemon-status-snapshot-docs`).
- Dropping deprecated **`inFlightLumpCount`** from JSON (`daemon-snapshot-meta-deprecation`).

## Proposed behavior

### `StatusData` additions

Per parent requirements: `inFlightRuns`, `nextTickAt?`, `tickPhase?`, `localConfigStale?`, `snapshotIncomplete?`, deprecated `inFlightLumpCount?`.

### Merge rules

- Pass through meta live fields; do not derive `nextTickAt` from `cronSetup` alone.
- Legacy: `inFlightLumpCount > 0` without `inFlightRuns` array → `inFlightRuns: []`, `snapshotIncomplete: true`, no fake rows.
- New meta: `inFlightLumpCount` on output equals `inFlightRuns.length` (deprecated field).

### `localConfigStale`

`readProjectLocalConfig` + `fingerprintResolvedLocalConfig` vs `meta.localConfigFingerprint`; omit flag when fingerprint missing or live config unreadable.

### `readDaemonMeta`

Import **`DaemonInFlightRun`** and live fields from the writer ticket’s `readDaemonMeta` changes; extend `toStatusData` only.

## Testing strategy

| Level | What |
| --- | --- |
| Unit | `commands/daemon-status/unit.test.ts` (inFlightRuns, snapshotIncomplete, localConfigStale, list-all envelope) |

Use planted meta JSON in tests; no running daemon required.

## Acceptance criteria

1. `daemon-status --json` matches parent acceptance criteria items 1, 6, 7 for read path.
2. Human output summarizes in-flight lines and notes stale/incomplete when flags set.
3. Fingerprint algorithm lives only in **`localConfigFingerprint`** (one module).
