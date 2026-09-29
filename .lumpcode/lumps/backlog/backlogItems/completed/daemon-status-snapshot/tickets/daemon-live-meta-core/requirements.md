# Requirements: Daemon live meta core writer

| Field | Value |
| --- | --- |
| **Backlog** | `daemon-live-meta-core` · priority **2** · ticket under `daemon-status-snapshot` |
| **Status** | Pending implementation |
| **Depends on** | `daemon-snapshot-meta-schema` |
| **Packages** | `@lumpcode/cli` only |

Global contract: [`../../requirements.md`](../../requirements.md). Builds on meta schema + fingerprint util from **`daemon-snapshot-meta-schema`**.

## Goals

1. **`daemonLiveMeta`**: serialized writer for `inFlightRuns` (push/pop lump lines by `(lumpName, effectiveDiscoveryBranch?)`), `tickPhase`, `nextTickAt`, transitional **`inFlightLumpCount === inFlightRuns.length`**.
2. **`runForeground`**: replace `createInFlightMetaUpdater`; Croner schedule fields; write **`localConfigFingerprint`** at start; `runLumpLine` begin/end lump line.
3. API includes **`setContextName`** on the writer (implementation here); wiring from the engine is **`daemon-live-meta-context`**.

## Non-goals

- `contextName` updates during context walk (next ticket).
- `daemon-status` read path.

## Acceptance criteria

1. Foreground daemon meta contains **`inFlightRuns`** entries for active lump lines (no `contextName` required yet).
2. **`nextTickAt`** / **`tickPhase`** update on tick boundaries.
3. **`localConfigFingerprint`** on meta after start.
4. Only **`daemonLiveMeta`** mutates live overlay fields.
