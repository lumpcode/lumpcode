# Lumpcode CLI — command reference

This page documents every `lumpcode` subcommand and its options.

## Contents

**[Global conventions](#ref-global-conventions)** — [Working directory](#ref-working-directory) · [`--json`](#ref-json-output) · [`--verbose`](#ref-verbose-output) · [Booleans](#ref-boolean-options) · [Validation](#ref-project-validation) · [`--help`](#ref-lumpcode-help)

**[Project setup](#ref-section-project-setup)** — [`lumpcode project-setup`](#ref-cmd-project-setup) · [`lumpcode lump-create`](#ref-cmd-lump-create)

**[Run](#ref-section-run)** — [`lumpcode run`](#ref-cmd-run) · [`lumpcode lump-plan`](#ref-cmd-lump-plan)

**[Daemon](#ref-daemon)** — [`lumpcode start`](#ref-cmd-start) · [`lumpcode stop`](#ref-cmd-stop) · [`lumpcode restart`](#ref-cmd-restart) · [`lumpcode daemon-status`](#ref-cmd-daemon-status) · [`lumpcode daemon-log`](#ref-cmd-daemon-log)

**[Status & cleanup](#ref-status-cleanup)** — [`lumpcode lump-status`](#ref-cmd-lump-status) · [`lumpcode context-status`](#ref-cmd-context-status) · [`lumpcode clean`](#ref-cmd-clean) · [`lumpcode reset-presets`](#ref-cmd-reset-presets)

**[Related documentation](#ref-related-documentation)** · **[Three “status” commands](#three-commands-that-mention-status)**

---

<a id="ref-global-conventions"></a>

## Global conventions

<a id="ref-working-directory"></a>

### Working directory

Most commands use the current working directory as the project root. Run `lumpcode` from the root of the git repository that contains `.lumpcode/`.

If a lump uses a **workspace copy** under `~/.lumpcode/project-copies/`, you still invoke the CLI from your real repo root; see [Workspace setup](./concepts.md#workspace-setup).

<h3 id="ref-json-output"><code>--json</code> output</h3>

Every subcommand accepts **`--json`**. Option tables below list only **command-specific** options.

When **`--json`** is set, the CLI prints a single JSON object instead of human-oriented lines:

```json
{
  "messages": ["…"],
  "data": { }
}
```

- **`messages`** — Always an array of strings (summary lines or errors).
- **`data`** — Optional structured payload (command-specific).

On failure the process exits non-zero. The result envelope goes to stderr on failure and stdout on success.

**Operational logging** (daemon ticks, lock waits, engine step detail) is separate from the result envelope. With **`--json`**, operational **`info`**, **`warn`**, and **`verbose`** lines are suppressed; operational **`error`** lines still print to stderr so you see failures that are not part of the final envelope (for example soft git commit/push errors during a run).

<h3 id="ref-verbose-output"><code>--verbose</code> operational logging</h3>

Every subcommand accepts **`--verbose`**. On **`run`** and **`start`** it gates **`Logger.verbose`** output — extra engine detail during a lump run (branch names, shell commands, git status snapshots, and similar). On other commands the flag is accepted for consistency but has no effect today.

**Not gated by `--verbose`:** normal operational progress at **`info`** level still prints on **`run`** / **`start`** without the flag — for example daemon tick summaries, branch-workspace lock-wait lines, and per-lump tick results. Those are suppressed only when **`--json`** is set (except operational **`error`** lines; see above).

Verbose is activated when **either** the CLI flag **or** the lump config field **`verbose: true`** is set for that **`run`** / **`start`** invocation (`effectiveVerbose = --verbose || lumpConfig.verbose`).

Operational logs use the shared **`Logger`** (`error`, `warn`, `info`, `verbose`). They are not mixed into the **`--json`** result envelope except that **`error`**-level operational lines still print when **`--json`** is set (see above).

<a id="ref-boolean-options"></a>

### Boolean options

Boolean options are **flags**: omit the flag for the default, pass the flag to select the non-default behavior.

```bash
lumpcode start --foreground
lumpcode context-status myLump myContext --setToFinished
```

For **`lumpcode lump-status`**, verbose status JSON is default; pass **`--silent`** for summary-only output.

**Windows / PowerShell:** single-quoted cron strings are safest: `--cronSetup '*/10 * * * *'`.

<a id="ref-project-validation"></a>

### Project validation

Commands that need a Lumpcode project verify that **`.lumpcode/`** and **`.git/`** exist under the effective project root. If not, they fail with a clear error message.

<h3 id="ref-lumpcode-help"><code>lumpcode --help</code></h3>

The program and each subcommand support **`--help`** (e.g. `lumpcode run --help`).

---

<a id="ref-section-project-setup"></a>

## Project setup

<a id="ref-cmd-project-setup"></a>

### `lumpcode project-setup`

**Description:** Create a fresh `.lumpcode/` tree in a git repository.

**Usage:** `lumpcode project-setup [options]`


| Option | Type | Required | Description |
| ------ | ---- | -------- | ----------- |
| `--projectPath` | string | No | Directory to initialize (default: `.` resolved from cwd) |
| `--projectName` | string | No | Stored in `project.json`; must be letters, digits, `_`, `-` only; if omitted, inferred from `origin` or directory basename and normalized |
| `--mode` | `shared` \| `dedicated` | No | Initial `local.json.mode` (default `shared`) — see [local-config.md](./local-config.md) |
| `--projectBaseBranch` | string | No | Initial `local.json.projectBaseBranch` (default `main`) |


**Creates:**

- `.lumpcode/project.json` — minimal `{ "projectName": "…" }`
- `.lumpcode/local.json` — `{ "mode": "shared", "projectBaseBranch": "main" }` (per machine, gitignored)
- `.lumpcode/lumps/` — empty
- `.lumpcode/commands/` — empty
- Appends `.lumpcode/**/contextStatusRecord.json`, `.lumpcode/**/history/`, `.lumpcode/.cache/`, and `.lumpcode/local.json` to `.gitignore`

**Fails if:**

- Path does not exist or is not a directory
- Path is not a git work tree
- `.lumpcode/` already exists

**See also:** [project-config.md](./project-config.md), [get-started.md](./get-started.md#step-2-initialize-the-lumpcode-project).

<a id="ref-cmd-lump-create"></a>

### `lumpcode lump-create`

**Description:** Scaffold a new lump configuration file.

**Usage:** `lumpcode lump-create <lumpName> [options]`


| Argument   | Required | Description                                                                               |
| ---------- | -------- | ----------------------------------------------------------------------------------------- |
| `lumpName` | Yes      | Folder name under `.lumpcode/lumps/`; no `/`, `\`, leading/trailing spaces, or `.` / `..` |



| Option     | Type            | Required | Description                      |
| ---------- | --------------- | -------- | -------------------------------- |
| `--config` | `json` \| `js` \| `ts` | No       | Output format (default `json`) |


**Creates:** `.lumpcode/lumps/<lumpName>/config.json`, `config.js`, or `config.ts`.

**Fails if:** A `config.json`, `config.js`, or `config.ts` already exists in that lump folder.

**See also:** [lump-config.md](./lump-config.md).

---

<a id="ref-section-run"></a>

## Run

<a id="ref-cmd-run"></a>

### `lumpcode run`

**Description:** Execute **one** tick for a single lump (load config, resolve contexts, run the agent, refresh status).

**Usage:** `lumpcode run <lumpName> [options]`


| Argument   | Required | Description                                 |
| ---------- | -------- | ------------------------------------------- |
| `lumpName` | Yes      | Name of the folder under `.lumpcode/lumps/` |


Plus global [`--json`](#ref-json-output).

**Behavior:**

1. Reads `.lumpcode/local.json` (hard-fails if missing); resolves `mode`, then runs **pre-flight** (`git fetch && git switch <projectBaseBranch> && git reset --hard origin/<projectBaseBranch> && git pull`) in the resolved workspace.
2. Runs the lump, then switches the workspace back to `projectBaseBranch`.

**Success cases:**

- Normal completion: message includes `SUCCESS: Lump run successfully` and `data` may include details of the run (branch name, context names, etc.).
- **Skipped run** when `maximumNumberOfConcurrentBranches` is reached: still a success but nothing is done.

**Fails if:** `local.json` missing or invalid, pre-flight git commands fail, config missing/invalid, or engine errors.

**See also:** [concepts.md](./concepts.md#one-run-end-to-end), [lump-config.md](./lump-config.md#optional-top-level-fields) (`maximumNumberOfConcurrentBranches`), [get-started.md](./get-started.md#step-5-run-once).

<a id="ref-cmd-lump-plan"></a>

### `lumpcode lump-plan`

**Description:** Preview a lump configuration before running it: validate config and hooks, list contexts, show generated prompts, or dry-run the next tick. Does **not** run pre-flight (no `git reset --hard`), does **not** invoke the coding agent, and does **not** push or commit.

**Usage:** `lumpcode lump-plan <lumpName> [options]`


| Argument   | Required | Description                                 |
| ---------- | -------- | ------------------------------------------- |
| `lumpName` | Yes      | Name of the folder under `.lumpcode/lumps/` |



| Option          | Type   | Required | Description                                                                 |
| --------------- | ------ | -------- | --------------------------------------------------------------------------- |
| `--contexts`    | flag   | No       | Include resolved context names and variables                                |
| `--todoOnly`    | flag   | No       | With `--contexts`, `--prompts`, or `--plan`: only contexts `run` would pick next (read-only git status queries) |
| `--prompts`     | flag   | No       | Include per-context prompt text and resolved agent command (`executable` + `args`) |
| `--plan`        | flag   | No       | Full dry-run: branch name, workspace setup/teardown shell commands, batch contexts, git add/commit/push strings, concurrent-branch skip reason |
| `--contextName` | string | No       | Scope contexts / prompts / plan to one context                              |

Plus global [`--json`](#ref-json-output).

**Depth:** flags stack by specificity: `--plan` > `--prompts` > `--contexts` > default (validate only).

**Behavior:**

1. Validates project root (`.lumpcode/` + `.git/`).
2. Loads lump config (`config.json` is checked against the JSON schema; `config.js` and `config.ts` are imported and resolved).
3. Resolves hooks, command modules, and `disabled` the same way as `run` (shared pipeline).
4. Optionally lists contexts, expands prompts, or simulates one run tick.

**Note:** `--prompts` and `--plan` may **execute** user-defined hooks (`setupFn`, `promptFn`, dynamic `steps` functions) to produce accurate output. They do not run the agent binary or git mutations.

**Fails if:** Project validation fails, `local.json` missing or invalid, config missing/invalid, or resolution errors.

**See also:** [lump-config.md](./lump-config.md), [`lumpcode run`](#ref-cmd-run).

---

<a id="ref-daemon"></a>

## Daemon

<a id="ref-cmd-start"></a>

### `lumpcode start`

**Description:** Run the **scheduler** that periodically executes lumps in the project (all loadable lumps by default, or one lump with `--lumpName`).

**Usage:** `lumpcode start [options]`


| Option         | Type    | Required | Description                                                              |
| -------------- | ------- | -------- | ------------------------------------------------------------------------ |
| `--foreground` | flag | No       | Blocking in this terminal; omit to detach a background daemon |
| `--cronSetup`  | string  | No       | Cron expression (default `*/5 * * * *` — every 5 minutes)                |
| `--lumpName`   | string  | No       | Run the scheduler for a single lump only                                 |

With **`--json`**, all the logs even the ones of the deamon will be with json output.

**`local.json` at startup:** `.lumpcode/local.json` is read **once** when the daemon starts (`mode`, `projectBaseBranch`, `workspaceStrategy`, `disabled`). Those values are frozen for every tick until you restart the daemon. Edit the file and restart to pick up changes.

**Pre-flight per tick:** skips the tick when `disabled` is `true` in the frozen config (no pre-flight, no lump runs). Otherwise it runs pre-flight (`git fetch && git switch <projectBaseBranch> && git reset --hard origin/<projectBaseBranch> && git pull`), then runs every targeted loadable lump whose own config is not `disabled`. If pre-flight fails the tick is **skipped** with an error logged to the daemon log file; the next tick tries again.

**Daemon files** under `~/.lumpcode/daemons/`:

| Scope | PID / log / meta |
| ----- | ---------------- |
| Project (default) | `<projectName>.daemon.pid`, `.daemon.log`, `.daemon.meta.json` |
| Single lump (`--lumpName`) | `<projectName>.<lumpName>.daemon.pid`, `.daemon.log`, `.daemon.meta.json` |

Meta JSON includes `{ "cronSetup": "…" }`, `"workspaceStrategy": "checkout" | "worktree"` (frozen from `local.json` at daemon start), and for per-lump daemons optional `"lumpName": "…"`.

**Collision rules:**

- Starting the **global** daemon fails if **any** daemon for this project is already running (global or per-lump).
- With **`checkout`** workspace strategy, only **one** daemon may run for the project (global or per-lump). Starting a new daemon fails while any other is alive.
- With **`worktree`** strategy, multiple **per-lump** daemons may run together only when **all** running daemons (including any you start against) use `worktree`. Starting a `worktree` daemon fails while a daemon started with **`checkout`** is still running — stop it first.
- The workspace strategy recorded in each daemon's meta file is the value frozen at **that daemon's** startup (not re-read from `local.json` on each tick).

**Detached mode (default):**

- Ensures `~/.lumpcode/daemons/` exists.
- Applies the collision rules above.
- Re-launches itself with `--foreground --cronSetup <expr>` (and `--lumpName` when scoped) and detaches, redirecting stdio to the log file.
- Writes PID + meta for `restart` and `daemon-status`.

**Foreground mode:**

- Validates cron, runs an immediate tick, then schedules ticks on the same cron.
- On SIGINT/SIGTERM, stops the scheduler and removes PID/meta if they belong to this process.

**Fails if:** No lumps with loadable config (or unknown `--lumpName`), invalid cron, daemon already running per the rules above, cannot write PID/log/meta, or `local.json` missing/invalid.

**See also:** [concepts.md](./concepts.md#when-to-use-run-vs-start-daemon), [get-started.md](./get-started.md#step-6-run-continuously-optional).

<a id="ref-cmd-stop"></a>

### `lumpcode stop`

**Description:** Stop the background daemon using the PID file (project-wide or per-lump).

**Usage:** `lumpcode stop [options]`

| Option       | Type   | Required | Description                                      |
| ------------ | ------ | -------- | ------------------------------------------------ |
| `--lumpName` | string | No       | Stop the daemon scoped to a single lump          |

**Behavior:** Reads the scoped PID file under `~/.lumpcode/daemons/`, sends **SIGTERM**, waits up to **5 seconds** for exit, then deletes PID and meta files on success.

**Fails if:** No PID file, invalid PID, cannot signal process, or process does not exit within the deadline.

**See also:** [concepts.md](./concepts.md#when-to-use-run-vs-start-daemon).

<a id="ref-cmd-restart"></a>

### `lumpcode restart`

**Description:** `lumpcode stop` then `lumpcode start` with the **same** `cronSetup` and scope read from meta (or the default if missing).

**Usage:** `lumpcode restart [options]`

| Option       | Type   | Required | Description                                      |
| ------------ | ------ | -------- | ------------------------------------------------ |
| `--lumpName` | string | No       | Restart the daemon scoped to a single lump       |

When `--lumpName` is omitted, `lumpName` from the meta file is used if present (so a bare `restart` preserves a per-lump daemon).

**See also:** [concepts.md](./concepts.md#when-to-use-run-vs-start-daemon).

<a id="ref-cmd-daemon-status"></a>

### `lumpcode daemon-status`

**Description:** Inspect daemon PID file and process liveness (project-wide or per-lump).

**Usage:** `lumpcode daemon-status [options]`

| Option       | Type   | Required | Description                                      |
| ------------ | ------ | -------- | ------------------------------------------------ |
| `--lumpName` | string | No       | Inspect the daemon scoped to a single lump       |

**Output highlights:**

- Whether a daemon is currently running for this scope
- Paths to the PID, log, and meta files
- Stale PID detection (process no longer exists)
- `cronSetup` and optional `lumpName` from meta when present

**See also:** [concepts.md](./concepts.md#when-to-use-run-vs-start-daemon) (daemon files table).

<a id="ref-cmd-daemon-log"></a>

### `lumpcode daemon-log`

**Description:** Tail the background daemon log file (project-wide or per-lump). **Follows live by default** (`tail -f`); pass **`--noFollow`** to print and exit.

**Usage:** `lumpcode daemon-log [options]`

| Option       | Type    | Required | Description                                                                 |
| ------------ | ------- | -------- | --------------------------------------------------------------------------- |
| `--lumpName` | string  | No       | Read the log for a per-lump daemon                                          |
| `--lines`    | number  | No       | Number of initial lines to show (with follow, uses `tail -n N -f`)            |
| `--noFollow` | flag    | No       | Print lines and exit instead of following live                              |
| `--json`     | flag    | No       | With `--noFollow`, output structured JSON (`logFilePath`, `lines`, …)       |

**Behavior:**

- Default: `tail -f` on the scoped log file until Ctrl+C / SIGTERM.
- With `--lines N` (no `--noFollow`): `tail -n N -f` — show the last *N* lines, then keep following.
- With `--noFollow`: print and exit (`tail` or `tail -n N` when `--lines` is set).
- Does not require the daemon to be running; fails if the log file does not exist for that scope.

**See also:** [concepts.md](./concepts.md#when-to-use-run-vs-start-daemon) (daemon files table).

---

<h2 id="ref-status-cleanup">Status & cleanup</h2>

<a id="ref-cmd-lump-status"></a>

### `lumpcode lump-status`

**Description:** For one lump (or all lumps), **recompute** `contextStatusRecord.json` from remote git state and print a summary.

**Usage:** `lumpcode lump-status [options]`


| Option       | Type   | Default | Description                                                                                                                   |
| ------------ | ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `--lumpName` | string | —       | If omitted, all lumps with loadable configs                                                                                   |
| `--silent`   | flag   | No      | Omit pretty-printed status JSON; print summary lines only (default is verbose when not using `--json`)                         |
| `--json`     | flag   | No      | JSON output mode                                                                                                              |


**Data:** `data.statusByLump` holds the in-memory maps keyed by lump name.

**See also:** [concepts.md](./concepts.md#status-lifecycle), [lump-config.md](./lump-config.md#contextstatusrecordjson).

<a id="ref-cmd-context-status"></a>

### `lumpcode context-status`

**Description:** Show or mutate a **single** context entry after refreshing the lump’s status record.

**Usage:** `lumpcode context-status <lumpName> <contextName> [options]`


| Argument      | Required | Description                   |
| ------------- | -------- | ----------------------------- |
| `lumpName`    | Yes      | Lump folder name              |
| `contextName` | Yes      | Context key inside the record |



| Option            | Type    | Required | Description                                                                                                                |
| ----------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--setToFinished` | flag | No       | Creates an **empty** marker commit on `baseBranch` with the lump’s normalized message and pushes `baseBranch` |


**Output:** Prints one JSON object for the context row (synthesized `toDo` row if missing).

**See also:** [concepts.md](./concepts.md#status-lifecycle).

<a id="ref-cmd-clean"></a>

### `lumpcode clean`

**Description:** Delete Lumpcode-created branches **locally** and on **`origin`**.

**Usage:** `lumpcode clean [options]`


| Option          | Type   | Required | Description                                                                         |
| --------------- | ------ | -------- | ----------------------------------------------------------------------------------- |
| `--lumpName`    | string | No       | Only branches under `lump/<lumpName>/…`                                             |
| `--contextName` | string | No       | Requires `--lumpName`; finds branches containing the marker commit for that context |


**Behavior:** Runs `git fetch --all` first, then deletes matching remote refs (`git push --delete origin …`) and local branches (`git branch -D …`).

**Rules:**

- `--contextName` without `--lumpName` is rejected.

**See also:** [lump-config.md](./lump-config.md#commit-messages) (marker format).

<a id="ref-cmd-reset-presets"></a>

### `lumpcode reset-presets`

**Description:** Reinstall shipped preset command modules into `~/.lumpcode/commands/presets/`, overwriting any files already there.

**Usage:** `lumpcode reset-presets [options]`


| Option   | Type | Default | Description      |
| -------- | ---- | ------- | ---------------- |
| `--json` | flag | No      | JSON output mode |


**Behavior:** Copies bundled presets (`cursor`, `copilot`, …) from the installed CLI package. Does not require a Lumpcode project directory. The same reinstall runs automatically on `npm install` / `npm update` of `@lumpcode/cli` and after standalone install via `install.sh`.

**See also:** [advanced-config.md](./advanced-config.md#shipped-presets) (preset resolution order).

---

<a id="ref-related-documentation"></a>

## Related documentation

- [get-started.md](./get-started.md) — Tutorial
- [concepts.md](./concepts.md) — Mental model and daemon
- [project-config.md](./project-config.md) — `project.json`
- [local-config.md](./local-config.md) — Per-machine `.lumpcode/local.json` (`mode`, `projectBaseBranch`)
- [lump-config.md](./lump-config.md) — Lump configuration
- [advanced-config.md](./advanced-config.md) — Hooks, dynamic prompts, custom commands

<a id="three-commands-that-mention-status"></a>

## Three commands that mention “status”

Do not confuse the **three CLI subcommands** below with the three per-context **status values** (`toDo`, `branchPushed`, `finished`) explained in [concepts.md](./concepts.md#core-terms).

| Command | What it checks |
|--------|----------------|
| **`lumpcode daemon-status`** | Is the **background daemon process** running? PID file, log path, `cronSetup` from meta. |
| **`lumpcode lump-status`** | For each lump, **recompute** `contextStatusRecord.json` from **remote git** (per-context `toDo` / `branchPushed` / `finished`). |
| **`lumpcode context-status`** | One **context** row after refresh; optional `--setToFinished` to push a marker on `baseBranch`. |
