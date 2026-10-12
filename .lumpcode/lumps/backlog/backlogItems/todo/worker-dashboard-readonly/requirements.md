# Requirements: Read-only worker dashboard (`lumpcode dashboard`)

| Field | Value |
| --- | --- |
| **Backlog** | `worker-dashboard-readonly` · priority **3** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `daemon-status-snapshot` (done) |
| **Packages** | New private `@lumpcode/dashboard` (`packages/apps/dashboard`). `@lumpcode/cli` gains the command. Website docs only: worker page and reference commands. `@lumpcode/core`, `@lumpcode/cli-utils`, and `@lumpcode/recipes` stay unchanged. |

## Problem statement and motivation

An operator on a worker can already ask `lumpcode daemon-status` what is running, but that is a one-shot terminal view. The worker is often a second clone or a machine the operator reaches over SSH. This first version is a single read-only page, served by the CLI, that follows the same snapshot.

1. Seeing in-flight lump lines, the current context, and the next tick means re-running `daemon-status`.
2. Several daemons plus the supervisor are one list. A page can show that list without a second status command.
3. Mutations (stop, restart, editing `local.json`) are a later ticket. This version only watches.

## Goals

1. `lumpcode dashboard` serves one page for the current project and stays in the foreground until Ctrl+C or SIGTERM.
2. The page shows the list-all `daemon-status` snapshot and updates itself every 5 seconds.
3. A failed read keeps the last successful snapshot. A snapshot older than 30 seconds shows a warning.
4. The command ships inside published `@lumpcode/cli`. `@lumpcode/dashboard` is not published.
5. Operators can find the command in the CLI docs, the website command reference, and a short pointer on the worker page.

## Non-goals

- Stop, force-stop, stop all, start, restart, or editing `.lumpcode/local.json` (`worker-dashboard-controls`).
- Tailing `daemon-log`, or any other log viewer.
- Git campaign progress (`toDo` / `branchPushed` / `finished`). That stays parked on `local-status-dashboard-mvp` and `cli-status-dashboard`.
- A token, TLS, nginx, or opening a browser.
- Publishing `@lumpcode/dashboard`, or a second install (`npx @lumpcode/dashboard`).
- Sub-tickets. One backlog item.
- Landing page and first-PR page copy.
- A fourth row in the "three commands named status" tables. This command is a view of `daemon-status`, not a new status command.
- History, charts, or anything beyond the current snapshot.

## User stories / use cases

1. As an operator on a worker — I run `lumpcode dashboard`, open the printed address, and see every daemon on this project plus the supervisor.
2. As an operator — I leave the page open and see in-flight lump lines, the current context, and the next tick change without reloading.
3. As an operator — A status read fails. The page keeps the last good snapshot, and if that snapshot is at least 30 seconds old I see a warning.
4. As an operator on a shared checkout — The command exits before it listens and tells me the dashboard is dedicated-only.
5. As an operator — I bind an address other than this machine and see one startup warning that the page has no authentication.

## Proposed behavior and UX

### Command

```text
lumpcode dashboard [--port <number>] [--bind <address>]
```

| Flag | Default | Rule |
| --- | --- | --- |
| `--port` | `4747` | Integer from 1 through 65535. Other values fail CLI parse before listen. |
| `--bind` | `127.0.0.1` | Non-empty address Node can listen on. |

No `--daemonId`. The page is always the list-all snapshot for this project (cwd, same project lookup as `daemon-status`).

Startup order, and exit before listen on any failure in steps 1–3:

1. `validateCurrentLumpProjectRoot`. On failure, the same message that helper already returns.
2. `readProjectLocalConfig`. On failure, that helper's message. When `mode` is `shared`, fail with code `sharedModeNoDaemon` and this message: `lumpcode dashboard is dedicated-only. Use a worker clone with mode: dedicated (another copy of the repo on this machine is enough).` Envelope matches `start`: `{ messages: [message], data: { code: 'sharedModeNoDaemon' } }`.
3. Listen. When the port is taken, fail with code `portInUse` and message `Port <port> is already in use.` Do not try another port.
4. Print the address and the bind warning (below), then poll.

The process stays up after a later status-read failure. Ctrl+C and SIGTERM close the server and exit 0. The command does not open a browser.

Human startup line (always, so the operator can open the page):

```text
Dashboard: http://127.0.0.1:4747
```

Host is the bind address. An IPv6 host is bracketed (`http://[::1]:4747`). Global `--json` does not stop the server and does not replace the page. With `--json`, startup is one compact JSON line that includes `url` and, when the warning applies, `bindWarning` with the warning text below. Do not emit a JSON line per poll. `--verbose` may log failed reads on the terminal. The page warning does not depend on `--verbose`.

Bind warning, printed only when the bind is not loopback, then the server still starts:

```text
Warning: the dashboard is reachable on 0.0.0.0 with no authentication.
```

Loopback (no warning): `127.0.0.1`, `::1`, `[::1]`, and `localhost` (any case). Any other bind warns, including `0.0.0.0`.

### Snapshot owner

`commands/daemon-status` is the only assembler of the snapshot (`listRunningProjectDaemons`, meta fields, `localConfigStale`, `snapshotIncomplete`). The dashboard calls that command's handler in-process with no `daemonId` and no `lumpName`, and the same project injections. It does not spawn `lumpcode daemon-status`, and it does not read daemon meta or recompute staleness of `local.json`.

Each poll uses the handler's `data` for list-all:

```ts
type DashboardStatus = {
  projectName: string;
  daemons: /* daemon-status StatusData, unchanged */ unknown[];
  supervisor: /* daemon-status SupervisorStatusData, unchanged */ unknown;
};
```

Do not print the handler's human `messages` on each poll.

### Poll, memory, and notices

Constants, one module in `@lumpcode/dashboard` (`src/snapshotTiming.ts`). Callers import them. No second copy of either number.

```ts
const STATUS_POLL_INTERVAL_MS = 5_000;
const SNAPSHOT_STALE_AFTER_MS = 30_000;
```

The first read starts when the server is listening, then one read every `STATUS_POLL_INTERVAL_MS`. At most one read at a time. A read still in flight delays the next one. It does not stack.

```ts
type DashboardView = {
  /** ISO-8601 UTC of the last successful list-all read. Absent until then. */
  fetchedAt?: string;
  /** Message of the latest failed read. Absent when the latest read succeeded. */
  readError?: string;
  /** Last successful list-all `data`. Absent until the first success. */
  status?: DashboardStatus;
};
```

On success, set `status` and `fetchedAt`, and clear `readError`. On failure, set `readError` to the failure message and leave `status` and `fetchedAt` as they were.

```ts
function dashboardNotices(input: {
  nowMs: number;
  fetchedAt?: string;
  readError?: string;
}): { showFailureNote: boolean; showStaleWarning: boolean };
```

| Condition | `showFailureNote` | `showStaleWarning` |
| --- | --- | --- |
| No `fetchedAt` yet, no `readError` (first read not finished) | false | false |
| `readError` set, no `fetchedAt` | true | false |
| `readError` set, age under 30 seconds | true | false |
| `fetchedAt` age ≥ 30 seconds | false | true |

Age is `nowMs - Date.parse(fetchedAt)`. The failure note includes the last success time when `fetchedAt` is set. The stale warning stays until a newer success, and it includes `readError` while reads are still failing. The page shows the last `status` whenever it exists, including next to a note or a warning. With no `status`, it shows no daemon rows.

`isLoopbackBind(bind: string) → boolean` in the dashboard package is the only exempt-set check. The CLI uses it for the startup warning.

### Page

One page. Layout, markup, and component structure are the implementer's choice. Keep it simple. Colors are the custom properties in `packages/apps/website/app/assets/css/main.css` (`--bg`, `--teal`, `--text`, and the rest of that `:root` block), copied onto the page. The dashboard does not import the Nuxt app and does not add a second palette.

The page makes these facts visible from `status`, and updates itself from the poll (the operator does not reload):

- Project name.
- Supervisor: running or not, and pid when running.
- Each daemon: `daemonId`, `running`, pid when present, `cronSetup`, `include`, `exclude`, `tickPhase`, `nextTickAt`, and each in-flight row (`lumpName`, `effectiveDiscoveryBranch` when set, `contextName` when set).
- When `localConfigStale` is true, a note that `local.json` changed and a restart is required to apply it. No restart control.
- When `snapshotIncomplete` is true, a note that in-flight work was reported without detail. No invented lump names.
- Other fields already on the daemon-status objects (paths, `maxParallelRun`, `metaStatus`, and the rest) stay on `status` and may be shown as text. Do not tail log files.

No control on the page writes config, starts, stops, or restarts anything.

Server entry the CLI calls:

```ts
function startDashboardServer(input: {
  port: number;
  bind: string;
  readStatus: () => Promise<
    | { ok: true; status: DashboardStatus }
    | { ok: false; message: string }
  >;
}): Promise<
  | Success<{ url: string; close: () => Promise<void> }>
  | Failure<{ code: 'portInUse'; message: string }>
>;
```

`readStatus` is the CLI's in-process `daemon-status` list-all call. The package owns the poll loop, `DashboardView`, and the page.

## Technical approach

1. Add `packages/apps/dashboard` with `package.json` `"name": "@lumpcode/dashboard"`, `"private": true`. Root workspaces already include `packages/apps/*`. Do not add the package to `scripts/npm-packages.mjs`.
2. Export `STATUS_POLL_INTERVAL_MS`, `SNAPSHOT_STALE_AFTER_MS`, `dashboardNotices`, `isLoopbackBind`, and `startDashboardServer` from that package. Those names are the owners. The CLI does not reimplement them.
3. `@lumpcode/cli` depends on `@lumpcode/dashboard` (`"*"`). New command module `packages/apps/cli/src/commands/dashboard/`, registered like `daemon-status` (`commands/index.ts` and the injection map in `main.ts`). Injections: `projectRoot`, `localConfigFolderPath`, `globalConfigFolderPath`.
4. The command runs the startup order above. Shared-mode refusal is local to this command. Do not call `assertDedicatedDaemonRequired`. That helper's message names `lumpcode start`, and this slice does not change it.
5. `readStatus` calls the `daemon-status` handler. List-all `data` is stored as `status` with no field mapping.
6. The published CLI bundle (ncc and SEA) serves the page from `lumpcode dashboard` with no separate install of `@lumpcode/dashboard`.

| Area | Files |
| --- | --- |
| Dashboard package | `packages/apps/dashboard/` (`src/snapshotTiming.ts`, server, page) |
| CLI command | `packages/apps/cli/src/commands/dashboard/`, `commands/index.ts`, `src/main.ts`, CLI `package.json` |
| Snapshot reader | unchanged owner: `packages/apps/cli/src/commands/daemon-status/` |
| Docs | listed below |

## Testing strategy

| Level | What | Where |
| --- | --- | --- |
| Unit | Constant values are 5000 and 30000 | `packages/apps/dashboard` test for `snapshotTiming.ts` |
| Unit | `dashboardNotices` rows in the table above | same package |
| Unit | `isLoopbackBind`: exempt `127.0.0.1`, `::1`, `[::1]`, `localhost`; warn for `0.0.0.0` | same package |
| Unit | Poll: first read on listen; success replaces `status` and clears `readError`; failure keeps the previous `status` and sets `readError`; a slow read does not overlap the next | server test with a stub `readStatus` |
| Unit | `portInUse` when the port is already bound; message names that port; close frees it | server test |
| CLI unit | Missing `.lumpcode` / `.git` exits with the existing project-root message and does not listen | `commands/dashboard/unit.test.ts` |
| CLI unit | `mode: shared` returns `sharedModeNoDaemon` and the dashboard message, and does not listen | same |
| CLI unit | Dedicated project: handler reaches listen; a stubbed or planted list-all snapshot is what the page serves; startup text contains `Dashboard: http://` | same |
| CLI unit | Non-loopback bind includes the warning text; `127.0.0.1` does not | same |
| CLI unit | No assertion that a browser was launched | same |

Use a free port chosen by the test (bind, read the port, close, pass `--port`). Do not rely on `4747` being free. Temp git repos follow the usual CLI fixture rules (`user.name` / `user.email`, under `os.tmpdir()`).

No new `daemon-status` tests. This slice does not change that command's JSON.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/commands.md` | Daemon index link plus a `lumpcode dashboard` section: flags, defaults, dedicated-only, foreground, printed URL, no auth on a non-loopback bind, page follows `daemon-status` list-all. Leave the three-status-commands table as three rows. |
| `packages/apps/website/content/docs/reference/commands.md` | Same command section, same limit on the status table. |
| `packages/apps/website/app/pages/docs/start/worker.vue` | One short pointer next to the existing companion-command sentence: once the worker is running, `lumpcode dashboard` shows the live snapshot. |
| Landing, first-PR page | No change. |

## Acceptance criteria

1. `lumpcode dashboard` on a dedicated project prints `Dashboard: http://…` and serves one page until Ctrl+C or SIGTERM (exit 0). It does not open a browser.
2. Default port is 4747 and default bind is `127.0.0.1`. `--port` and `--bind` override them. A taken port exits with `portInUse` and `Port <port> is already in use.`
3. A non-loopback bind prints the no-authentication warning and still serves. `127.0.0.1`, `::1`, and `localhost` do not warn.
4. Shared mode and a non-project cwd exit before listen. Shared mode uses code `sharedModeNoDaemon` and the dashboard message. `assertDedicatedDaemonRequired` is unchanged.
5. The page shows the list-all snapshot facts listed above, including an idle project (empty `daemons`, supervisor line) and the two warning notes, with no mutation controls.
6. The page updates from a read about every 5 seconds. A failed read keeps the last `status`. Under 30 seconds the failure note is shown. At 30 seconds the stale warning is shown and includes the read error while failures continue.
7. Snapshot fields match `daemon-status` list-all `data`. No second meta reader or `localConfigStale` calculation exists in the dashboard package or the dashboard command.
8. `STATUS_POLL_INTERVAL_MS` and `SNAPSHOT_STALE_AFTER_MS` are the only copies of those durations. `isLoopbackBind` is the only loopback exempt set.
9. `@lumpcode/dashboard` is private and absent from `scripts/npm-packages.mjs`. A packed `@lumpcode/cli` serves the page via `lumpcode dashboard` alone.
10. The three docs surfaces above mention the command. The landing page and the first-PR page do not.
