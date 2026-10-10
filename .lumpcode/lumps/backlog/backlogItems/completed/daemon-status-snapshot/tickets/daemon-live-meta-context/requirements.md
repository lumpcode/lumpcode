# Requirements: Daemon live meta context telemetry

| Field | Value |
| --- | --- |
| **Backlog** | `daemon-live-meta-context` · priority **2** · ticket under `daemon-status-snapshot` |
| **Status** | Pending implementation |
| **Depends on** | `daemon-live-meta-core` |
| **Packages** | `@lumpcode/cli` only |

Global contract: [`../../requirements.md`](../../requirements.md) (context lifecycle table).

## Goals

1. Optional **`daemonRunTelemetry`** on `runLumpFromJsConfig` / `runLumpFromLumpName`, forwarded through **`jsConfigToRunLumpInput`**.
2. On context walk start/end, call **`daemonLiveMeta.setContextName`** (set / clear) for the active lump line key.
3. Daemon tick passes reporter into lump runs; manual **`lumpcode run`** omits it.

## Non-goals

- New meta fields or `readDaemonMeta` changes.
- `daemon-status` command.

## Acceptance criteria

1. During a foreground daemon lump run, meta **`contextName`** appears on the matching `inFlightRuns` row while a context walks, and clears between contexts on the same line.
2. No telemetry on manual `run` unless explicitly injected in tests.
