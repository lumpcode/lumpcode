# Requirements: Daemon live-meta subscribe

| Field | Value |
| --- | --- |
| **Backlog** | `daemon-live-meta-subscribe` · priority **4** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `daemon-status-snapshot` (completed) |
| **Packages** | `@lumpcode/cli` only. Core, recipes, website, CLI `DOCS/` unchanged. |

## Problem statement and motivation

`createDaemonLiveMetaWriter` already exposes the live-meta events as methods (`beginLumpLine`, `setContextName`, `endLumpLine`, `setTickPhase`, `setNextTickAt`, `writeFingerprintAtStart`). The only consumer of those calls is the JSON persist inside the writer. `runForeground` still logs on a parallel channel. A future unified log (one line per reported event, nothing else) needs a way to subscribe to those handlers without a second telemetry path.

1. There is no listener API; adding logging or other observers means wrapping every call site.
2. Emitting before disk would let listeners claim a state that `daemon-status` cannot read.

## Goals

1. `createDaemonLiveMetaWriter` returns the existing writer plus a **`subscribe`** function.
2. A listener is invoked **only after** that handler’s **JSON persist succeeds**. No write means no event. Persist failure means no event.
3. Existing occupancy / tick / fingerprint behavior and `daemon-status` stay unchanged when nobody is subscribed.

## Non-goals

- Unified daemon logging (drop or replace `logger.info` in `runForeground` / `runLumpLine`). Follow-up ticket.
- Changing `inFlightRuns` identity, persist algorithm, or `daemon-status` JSON.
- Skipping persist on current no-op writes that still rewrite the file (`endLumpLine` of an unknown line still persists today and therefore still emits).
- Event history, replay, or a process-wide bus outside this writer instance.
- Website / CLI `DOCS/` (internal util).
- `@lumpcode/core` changes.

## User stories / use cases

1. As an implementer — I `subscribe` once after constructing the writer and receive every successful live-meta persist, so a later logger can be a second fold of the same handler calls.
2. As an operator — `lumpcode daemon-status` still matches `.daemon.meta.json`; listeners never see an event for a write that did not land.

## Proposed behavior and UX

### Factory return

```ts
type DaemonLiveMetaSubscribe = (
  listener: (event: DaemonLiveMetaEvent) => void | Promise<void>,
) => () => void;

function createDaemonLiveMetaWriter(
  input: CreateDaemonLiveMetaWriterInput,
): [DaemonLiveMetaWriter, DaemonLiveMetaSubscribe];
```

`DaemonLiveMetaWriter` method signatures stay as they are today. The second tuple element is **`subscribe`**, not a mutable subscriber array. `subscribe(listener)` returns **`unsubscribe`**. Several listeners are allowed; notify in subscribe order. Unsubscribe drops that listener for later persists (a notify already running may finish).

### Event shape

`DaemonLiveMetaEvent` is the writer methods as data (no parallel taxonomy):

```ts
type DaemonLiveMetaEvent =
  | { method: 'writeFingerprintAtStart'; args: [fingerprint: string] }
  | { method: 'beginLumpLine'; args: [line: LumpLine] }
  | { method: 'setContextName'; args: [input: LumpLine & { contextName: string | null }] }
  | { method: 'endLumpLine'; args: [line: LumpLine] }
  | { method: 'setTickPhase'; args: [phase: 'idle' | 'running'] }
  | { method: 'setNextTickAt'; args: [iso: string | undefined] };
```

Payload is **method name + the args that handler received**, not a reread of the file. `daemon-status` remains the file reader.

### When to emit

JSON on disk is the source of truth.

| Handler outcome | Persist? | Emit? |
| --- | --- | --- |
| `beginLumpLine` new line | yes | after persist succeeds |
| `beginLumpLine` duplicate run key | no | no |
| `setContextName` matching row | yes | after persist succeeds |
| `setContextName` no matching row | no | no |
| `endLumpLine` (found or missing) | yes (current writer) | after persist succeeds |
| `writeFingerprintAtStart` / `setTickPhase` / `setNextTickAt` | yes | after persist succeeds |
| any handler, persist throws | attempted, fails | no |

Emit **after** `await persist()` inside the same serialized `enqueue` as today’s writes. Await each listener before the next queued handler runs.

Listener throw: log with the writer’s `logger`; **do not** fail the writer method; **do not** roll back JSON. Telemetry must not abort a lump line.

### Call site

`runForeground.ts` destructures `[liveMeta, subscribe]`. This ticket does **not** register a listener. Unused `subscribe` is fine (`void subscribe` or equivalent so the binding is intentional).

## Technical approach

1. **Owner:** only `packages/apps/cli/src/utils/daemonLiveMeta/` defines subscribe, event type, and notify-after-persist. `runForeground` must not fan out handler calls on its own. Do not add a second live-meta writer.
2. Keep persist + in-memory occupancy as they are; insert notify only on the successful persist path.
3. Update `createDaemonLiveMetaWriter` callers for the tuple return: `runForeground.ts`, `daemonLiveMeta/unit.test.ts`.

### Affected files (primary)

| Area | Files |
| --- | --- |
| Writer | `packages/apps/cli/src/utils/daemonLiveMeta/main.ts` (export event + subscribe types from the same module) |
| Call site | `packages/apps/cli/src/utils/launchStartDaemon/runForeground.ts` |
| Tests | `packages/apps/cli/src/utils/daemonLiveMeta/unit.test.ts` |

## Testing strategy

| Level | What | Where |
| --- | --- | --- |
| Unit | After successful `beginLumpLine` / `setContextName` / `endLumpLine` / tick / fingerprint persist, listener sees `{ method, args }` | `daemonLiveMeta/unit.test.ts` |
| Unit | Duplicate `beginLumpLine` and `setContextName` with no row: no persist, no event | same |
| Unit | Persist failure: no event; occupancy unchanged (existing begin-persist-fail case plus listener spy) | same |
| Unit | Listener throw: writer method still succeeds; JSON matches the persist; later events still fire | same |
| Unit | `unsubscribe` stops further events; second `subscribe` is notified in order | same |
| Unit | Call-site compile: `runForeground` / existing start in-flight meta tests still pass (no listener wired) | `start/testing/daemonInFlightMeta.unit.test.ts` (no new cases required unless a type break shows up) |

Do not require a running daemon for subscribe tests. Do not add E2E.

## Acceptance criteria

1. `createDaemonLiveMetaWriter` returns `[writer, subscribe]`; `subscribe(listener)` returns `unsubscribe`.
2. Listeners run only after a successful JSON persist for that handler, on the writer’s existing serial queue.
3. No persist (duplicate begin, missing `setContextName` row) produces no event.
4. Persist throw produces no event.
5. Listener throw does not fail the writer method and does not change the file.
6. With no subscriber, meta occupancy / tick / fingerprint behavior matches today.
7. No second live-meta mutation path outside `daemonLiveMeta`.
8. No unified-logging change in `runForeground` (no new log lines derived from events; existing `logger.info` stays).
