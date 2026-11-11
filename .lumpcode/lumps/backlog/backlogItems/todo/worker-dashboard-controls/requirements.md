# Requirements: Worker dashboard controls

| Field | Value |
| --- | --- |
| **Backlog** | `worker-dashboard-controls` · priority **4** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `worker-dashboard-readonly` (done) |
| **Packages** | `@lumpcode/dashboard` (`packages/apps/dashboard`, primary: routes, guard, page, action state). `@lumpcode/cli` (`commands/dashboard`, one new util). `@lumpcode/core`, `@lumpcode/cli-utils`, `@lumpcode/recipes` stay unchanged. The `stop`, `start`, `restart`, and `daemon-status` commands keep their flags and JSON unchanged. |

## Problem statement and motivation

`lumpcode dashboard` shows the live worker snapshot but cannot act on it. To stop a busy daemon, restart after a `local.json` edit, or bring the supervisor back, the operator leaves the page for an SSH shell and types the matching command. The page already shows when a restart is needed (`localConfigStale`) but offers no way to do it.

1. Stop, force-stop, stop all, and restart need a terminal on the worker.
2. Editing `.lumpcode/local.json` on a remote worker means an editor over SSH, with no validation until the next daemon start fails.
3. After a `local.json` change, the operator must remember which daemons to restart.
4. A page that can stop processes and rewrite config cannot be reachable without authentication, and cannot accept requests from other web pages in the same browser.

## Goals

1. The page stops, force-stops, and restarts one daemon, stops or force-stops all daemons plus the supervisor, and starts the supervisor alone.
2. The page edits `.lumpcode/local.json` only, validates the edit before writing, and offers to restart running daemons after a save.
3. While any daemon is running, the editor warns that a saved change only applies after a restart. Daemons whose `localConfigStale` is true keep that note.
4. Every control runs the same command handler as the CLI command, in-process, so results and failure messages match the terminal.
5. Controls exist only on a loopback bind and only for requests from the page itself.

## Non-goals

- Starting a new daemon with `--include`, `--exclude`, `--daemonId`, `--cronSetup`, or `--maxParallelRun`. The only start control is `start --superviseOnly`.
- Editing `project.json`, `.lumpcode/daemons/*`, lump configs, `desired.json`, meta, or any other file.
- Log tailing, transcripts, or git campaign status.
- Authentication, user accounts, TLS, or controls on a non-loopback bind.
- Changing `stop`, `start`, `restart`, or `daemon-status` behavior, flags, or messages.
- Switching `mode` from the page.
- A `--readOnly` flag. A non-loopback bind is the only way to get the read-only page.

## User stories / use cases

1. As an operator with the dashboard tunneled over SSH — a daemon is stuck mid-run, so I click Force stop on its row, confirm, and see the stop message plus the row going to not running.
2. As an operator — I raise `maxParallelRun` in the editor, save, and click "Restart running daemons" to apply it everywhere.
3. As an operator — I save `local.json` with a typo, and the page shows the same validation message `lumpcode start` would print. Nothing is written.
4. As an operator — someone edited `local.json` over SSH after I opened the editor. My save is refused so I do not overwrite their change.
5. As an operator — the supervisor is down, so I click Start supervisor and see the `start --superviseOnly` message.
6. As an operator binding `0.0.0.0` — the page still shows the snapshot, has no controls, and the CLI says controls are off.

## Proposed behavior and UX

### When controls are on

| Bind | Controls | Startup output |
| --- | --- | --- |
| Loopback (`isLoopbackBind` true) | On | `Dashboard: http://…` (unchanged) |
| Anything else | Off. Page and routes are the current read-only ones. | Existing no-authentication warning, then `Controls are off on a non-loopback bind. Tunnel to 127.0.0.1 to use them.` |

`--json` startup gains `controls: boolean`. `isLoopbackBind` stays the only loopback check.

### Actions

| Page control | Where | Handler call (in-process, same injections as the dashboard command) | Confirm dialog |
| --- | --- | --- | --- |
| Stop | daemon row, running only | `stop` `{ daemonId }` | no |
| Force stop | daemon row, running only | `stop` `{ daemonId, force: true }` | yes |
| Restart | daemon row, running only | `restart` `{ daemonId }` | no |
| Stop all | project header | `stop` `{ all: true }` | yes |
| Force stop all | project header | `stop` `{ all: true, force: true }` | yes |
| Start supervisor | supervisor line, only when not running | `start` `{ superviseOnly: true }` | no |
| Restart running daemons | after a successful save, and next to any `localConfigStale` note | `restart` `{ daemonId }` per daemon with `running: true` in a fresh list-all `daemon-status` read, one at a time | no |

Restart running daemons keeps going after a failure (for example `daemonBusy`). Its outcome is `ok` only when every restart succeeded. Its messages are each daemon's messages, prefixed with the daemon id.

```ts
type DashboardActionRequest =
  | { kind: 'stop' | 'forceStop' | 'restart'; daemonId: string }
  | { kind: 'stopAll' | 'forceStopAll' | 'startSupervisor' | 'restartRunning' };

type DashboardActionOutcome = { ok: boolean; messages: string[]; code?: string };
```

`messages` and `code` come from the handler's result (`data.code` when present).

Actions run in the background. At most one action runs at a time. The server records it on the view, and the page shows it on the next refresh:

```ts
type DashboardView = {
  /* existing fields unchanged */
  action?: {
    request: DashboardActionRequest;
    startedAt: string; // ISO-8601 UTC
    finishedAt?: string;
    outcome?: DashboardActionOutcome;
  };
};
```

When an action finishes, the next status read starts at once instead of waiting out the poll interval. Reads still never overlap. The page shows the latest action (running, or its outcome and messages) until another action starts.

### local.json editor

The editor shows the file's current text. Save sends the edited text plus the hash of the text it loaded. Validation runs in this order, and nothing is written on any failure:

| Check | Failure `code` | Message |
| --- | --- | --- |
| File on disk still hashes to `expectedSha256` | `localConfigChanged` | `local.json changed on disk since you opened it. Reload before saving.` |
| Text parses as JSON | `invalidLocalConfig` | `Invalid .lumpcode/local.json: <JSON parse error>` |
| `localJsonConfigSchema` | `invalidLocalConfig` | `Invalid .lumpcode/local.json: <formatZodIssues>`, the same text `readLocalConfig` returns |
| `mode` stays `dedicated` | `invalidLocalConfig` | `The dashboard cannot change mode. Edit .lumpcode/local.json directly.` |
| `mergeProjectAndLocalConfig` with the current `project.json` | `invalidLocalConfig` | that function's `Invalid merged project/local config: …` |
| Atomic write | `writeFailed` | `writeJsonFile`'s failure message |

On success the file is written with `writeJsonFile` (`pretty: true`, `trailingNewline: true`). Formatting is normalized. The response returns the new hash. While any daemon in the last snapshot has `running: true`, the editor shows `Running daemons keep their current settings until they restart.` After a successful save with running daemons, it offers Restart running daemons.

The editor and the action result area sit outside the element that the 5-second refresh replaces, so a refresh does not discard unsaved text.

### Routes and guard

Only present when controls are on. With controls off, these paths return 404 as today.

| Method | Path | Body | Responses |
| --- | --- | --- | --- |
| `POST` | `/actions` | `DashboardActionRequest` | `202 { accepted: true }`, `409 { code: 'actionInProgress' }`, `400 { code: 'badRequest' }` |
| `GET` | `/local-config` | none | `200 { text, sha256 }`, `500 { code: 'readFailed', message }` |
| `PUT` | `/local-config` | `{ text, expectedSha256 }` | `200 { sha256, messages }`, `409 { code: 'localConfigChanged', message }`, `422 { code: 'invalidLocalConfig', message }`, `500 { code: 'writeFailed', message }` |

Guard, applied when controls are on and owned by one function in the dashboard package (`isTrustedDashboardRequest`):

1. Every route, including `GET /`, `/view`, and `/snapshot`, requires a `Host` header of `127.0.0.1:<port>`, `localhost:<port>`, or `[::1]:<port>` (any case). Otherwise `403 { code: 'forbidden' }`. This blocks DNS-rebinding pages from reading the token.
2. `POST /actions`, `GET /local-config`, and `PUT /local-config` also require header `x-lumpcode-dashboard-token` equal to the per-server token. Otherwise `403 { code: 'forbidden' }`. The server never answers CORS preflight, so other origins cannot send that header.
3. Request bodies over 256 KiB get `413`. A body that is not valid JSON gets `400 { code: 'badRequest' }`.

The token is 32 random bytes, hex, made once per server start. It is embedded in the document `<head>` as `<meta name="lumpcode-dashboard-token" content="…">`. It is never printed on the terminal or in `--json`.

### Server entry

```ts
type DashboardControls = {
  runAction: (request: DashboardActionRequest) => Promise<DashboardActionOutcome>;
  readLocalConfig: () => Promise<
    | { ok: true; text: string; sha256: string }
    | { ok: false; message: string }
  >;
  writeLocalConfig: (input: { text: string; expectedSha256: string }) => Promise<
    | { ok: true; sha256: string; messages: string[] }
    | { ok: false; code: 'localConfigChanged' | 'invalidLocalConfig' | 'writeFailed'; message: string }
  >;
};

// StartDashboardServerInput gains:
controls?: DashboardControls;
```

When `controls` is absent, the server behaves exactly as today. The dashboard package owns the routes, the guard, the token, one-action-at-a-time, `DashboardView.action`, and the page. It never calls CLI code directly.

## Technical approach

1. **Dashboard package types.** Add `DashboardActionRequest`, `DashboardActionOutcome`, `DashboardControls`, and `DashboardView.action` in `src/types.ts`, and export them from `src/index.ts`.
2. **Guard.** Add `src/isTrustedDashboardRequest.ts`: `isTrustedDashboardRequest({ hostHeader, port, tokenHeader?, token, needsToken }) → boolean`. It is the only Host and token check. Routes call it, not inline comparisons.
3. **Server.** In `src/server.ts`, when `controls` is set: generate the token, apply the guard, add the three routes, run actions one at a time in the background, record `view.action`, and trigger the next read once an action finishes, still one read at a time. Without `controls`, the code path and responses stay as today, and existing server tests pass unchanged.
4. **Page.** In `src/page.ts`, render controls (per-row, project header, supervisor line) only when the server was started with `controls`. Add the token meta tag, the editor and action panel outside `#view`, `confirm()` for the three destructive actions, and event delegation so buttons inside the refreshed `#view` keep working. Keep the existing palette. Change the lede "This page only watches." to read-only mode only.
5. **CLI local.json writer.** New util `packages/apps/cli/src/utils/writeLocalConfigText/` (`main.ts`, `index.ts`, `unit.test.ts`, utils barrel):
   `writeLocalConfigText({ localConfigFolderPath, text, expectedSha256 }) → Promise<Success<{ sha256: string }> | Failure<{ code: 'localConfigChanged' | 'invalidLocalConfig' | 'writeFailed'; message: string }>>`.
   It runs the checks in the editor table in that order, reusing `localJsonConfigSchema`, `formatZodIssues`, `readProjectJson`, `mergeProjectAndLocalConfig`, and `writeJsonFile`. It is the only place the dashboard writes `local.json`. A companion `readLocalConfigText({ localConfigFolderPath }) → Promise<Success<{ text: string; sha256: string }> | Failure<string>>` lives in the same util (sha256 hex of the file bytes).
6. **CLI controls.** New `packages/apps/cli/src/commands/dashboard/controls.ts` exporting `createDashboardControls(injections) → DashboardControls`. It is the only map from `DashboardActionRequest.kind` to `stop` / `start` / `restart` handler calls (`command.handlerMaker(...)` from those commands' `index.ts`, the same pattern the dashboard already uses for `daemon-status`). `restartRunning` reads list-all `daemon-status` fresh at action time. It never spawns `lumpcode`.
7. **Command.** In `commands/dashboard/main.ts`, pass `controls` only when `isLoopbackBind(bind)`. Add the controls-off line and `controls` to the startup output. Update the command description.

| Area | Files |
| --- | --- |
| Dashboard package | `packages/apps/dashboard/src/{types,index,server,page,isTrustedDashboardRequest}.ts` |
| CLI util | `packages/apps/cli/src/utils/writeLocalConfigText/`, `packages/apps/cli/src/utils/index.ts` |
| CLI command | `packages/apps/cli/src/commands/dashboard/{main,controls}.ts` |
| Unchanged owners | `commands/stop`, `commands/start`, `commands/restart`, `commands/daemon-status`, `utils/readLocalConfig` |

## Testing strategy

| Level | What | Where |
| --- | --- | --- |
| Unit | `isTrustedDashboardRequest`: the three loopback hosts with the right port pass; wrong port, `evil.example:<port>`, and a missing Host fail; the token is required only when `needsToken`; a wrong token fails | `packages/apps/dashboard/src/isTrustedDashboardRequest.unit.test.ts` |
| Unit | Server without `controls`: `/actions` and `/local-config` are 404, and no token meta tag appears in `/`. Existing tests unchanged. | `server.unit.test.ts` |
| Unit | Server with stub `controls`: 403 on a bad Host for `/`; 403 without the token on `/actions`; 202 then 409 while a slow stub action runs; `view.action` gets `startedAt`, then `finishedAt` and `outcome`; a read runs right after the action finishes; 413 over 256 KiB; 400 on bad JSON | same |
| Unit | Page: controls and token only when enabled; Start supervisor only when the supervisor is not running; editor outside `#view`; read-only lede only when disabled | `page.unit.test.ts` |
| CLI unit | `writeLocalConfigText`: hash mismatch gives `localConfigChanged` and leaves the file unchanged; bad JSON, a schema failure, a `mode: shared` change, and a merged failure (no primary branch on either layer) give `invalidLocalConfig` with the messages in the table and leave the file unchanged; success writes pretty JSON and returns the new hash | `utils/writeLocalConfigText/unit.test.ts` with a temp `.lumpcode` under `os.tmpdir()` |
| CLI unit | `createDashboardControls`: each kind calls the matching handler options (stop with and without force, `all`, `superviseOnly`, restart); `restartRunning` restarts only running ids, keeps going after one failure, and returns `ok: false` with prefixed messages | `commands/dashboard/unit.test.ts`, using the existing daemon fixtures and the `spawnFn` / `skipEnsureSupervisor` seams |
| CLI unit | Loopback bind passes controls (`controls: true` in JSON startup). `0.0.0.0` prints the controls-off line, has `controls: false`, and 404s on `/actions`. | same |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/reference/commands.md` (`lumpcode dashboard`) | Replace "Nothing on the page stops, starts, or restarts a daemon" with the action list, the `local.json` editor and its validation, loopback-only controls, and `controls` in `--json` startup. |
| `packages/apps/cli/DOCS/start/observe.md` (Dashboard) | Replace "A read-only page… Nothing on the page can start or stop anything" with a short paragraph on stop, restart, supervisor start, and `local.json` editing. Keep the SSH tunnel advice, and say controls need it because `--bind 0.0.0.0` turns them off. |
| `packages/apps/cli/DOCS/start/worker.md` | No change unless it calls the dashboard read-only. |

## Acceptance criteria

1. On a loopback bind, the page can stop, force-stop, and restart a daemon, stop or force-stop all, start the supervisor, and restart running daemons. Each outcome shows the same messages the matching CLI command prints.
2. Force stop, Stop all, and Force stop all ask for confirmation first.
3. A second action while one is running gets `409 actionInProgress`. The page shows the running action and then its outcome.
4. Saving `local.json` with a hash mismatch, bad JSON, a schema failure, a mode change, or a merged-config failure writes nothing and shows the message in the table. A valid save writes pretty JSON and offers Restart running daemons when any daemon is running.
5. Unsaved editor text survives the 5-second refresh.
6. On a non-loopback bind, the page has no controls, the control routes are 404, and startup prints the controls-off line.
7. With controls on, a request whose Host is not loopback-with-port gets 403 on every route, and a control request without the page token gets 403.
8. `stop`, `start`, `restart`, and `daemon-status` behavior and JSON are unchanged. No CLI file other than `commands/dashboard/controls.ts` maps dashboard actions to handlers. No file other than `utils/writeLocalConfigText` writes `local.json` for the dashboard. No route other than through `isTrustedDashboardRequest` checks the Host or the token.
9. The two docs pages describe the controls and no longer call the dashboard read-only.
