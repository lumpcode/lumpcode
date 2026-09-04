# Getting started with the Lumpcode CLI

Readable website version: [lumpcode.com/docs/start/first-pr](https://www.lumpcode.com/docs/start/first-pr) · [docs](https://www.lumpcode.com/docs).

Follow this guide in order to get started with your first `lumpcode run`. Links at each step point to more detail if you want it.

---

## Prerequisites

You only need a machine with your repo, git access, and a configured CLI agent. Install and prepare the following:

1. **Lumpcode agent skill** — so your coding agent has current Lumpcode docs context (without it, the agent has no current product context): `npx skills add lumpcode/skills`.
2. **Lumpcode CLI** on your `PATH` — Install globally: `npm install -g @lumpcode/cli` (Node 22+). Details: [README.md § Install](../README.md#install).
3. **Git** repository with **`origin`** reachable for fetch/push. The **`primaryBranch`** you'll declare (typically in `.lumpcode/project.json`, optionally overridden in gitignored `local.json`) must **already exist on `origin`** (e.g. `origin/main`): Lumpcode fetch/resets to it during pre-flight and reads it via `origin/<branch>` for status.
4. **CLI coding agent** installed and runnable. Lumpcode invokes the **`command`** you set in lump config by resolving a command module in this order: `.lumpcode/commands/<name>.js` (project), then `~/.lumpcode/commands/<name>.js` (global override), then shipped presets at `~/.lumpcode/commands/presets/<name>.js`. Built-in preset names **`cursor`**, **`copilot`**, **`claude-code`**, **`opencode`**, and **`codex`** work out of the box when `cursor-agent`, `copilot`, `claude`, `opencode`, or `codex` is on `PATH`; other agents (e.g. **`aider`**) need a custom module.

---

## Terms you need for this tutorial

| Term | Meaning |
|------|---------|
| **Project** | A folder with git that contains both `.git/` and `.lumpcode/` (the CLI adds `.lumpcode/` once you initialize). |
| **Lump** | One **agent loop campaign** in your repo: context discovery, prompt(s), agent command and other config details under `.lumpcode/lumps/<lumpName>/`. |
| **Context** | One unit of work inside a lump (e.g. one file or one component). Each context has a **name** and **variables** filled into your prompt. |
| **Marker commit** | Lumpcode writes **`LUMP: <lumpName> - <contextName>`** as the commit subject. Status matches that string anywhere in the remote commit message. Keep it when squashing (see [concepts.md](./concepts.md)). |
| **Resumable** | Re-running `lumpcode run` or a daemon tick skips contexts that already have a matching marker on the remote. |

More details, diagrams and context status values (`toDo`, `branchPushed`, `finished`): [concepts.md](./concepts.md).

---

## Step 0: Open a git project

```bash
cd /path/to/your/repo
git status   # remotes should be set up and accessible
```

You only need **`.git/`** here. The next steps create **`.lumpcode/`** in this same directory. After that, this folder is your **Lumpcode project root**.

---

## Step 1: Initialize the Lumpcode project

From the repository root:

```bash
lumpcode project-setup
```

This creates:

```text
.lumpcode/
├── project.json      # projectName + primaryBranch (+ optional team defaults; commit this)
├── local.json        # per-machine mode (gitignored; may override shared keys)
├── lumps/            # one folder per lump
└── commands/         # optional custom agent command modules (.js)
```

**`project.json`** stores **`projectName`** (letters, digits, `_`, and `-` only) and **`primaryBranch`** (from `--primaryBranch`, default `main`). If you omit **`--projectName`**, `project-setup` infers a name from **`origin`** or the directory basename and normalizes it to those rules. That same value is used for daemon files and for `~/.lumpcode/project-copies/<projectName>/` when `local.json.mode` is `shared`. You can also set team defaults such as `"command": "cursor"` here so lumps can omit top-level `command`.

**`local.json`** is per machine and gitignored. The default scaffold is:

```json
{
  "mode": "shared"
}
```

Keep `shared` on your workstation (Lumpcode never touches your checkout — it runs in a separate copy). Edit it to `"dedicated"` on a server / daemon machine that you don't develop on. Full reference: [local-config.md](./local-config.md).

Optional flags:

- `--projectPath <dir>` — Initialize another directory (default: current working directory).
- `--projectName <name>` — Stored verbatim; must already satisfy the character rules (see [project-config.md](./project-config.md#projectname-rules)).
- `--mode <shared|dedicated>` — Initial `local.json.mode` (default `shared`).
- `--primaryBranch <branch>` — Initial `project.json.primaryBranch` (default `main`).

Extra fields (`maximumNumberOfConcurrentBranches`, …): [project-config.md](./project-config.md).

---

## Step 2: Create a lump

```bash
lumpcode lump-create myFirstLump
```

By default this writes **`.lumpcode/lumps/myFirstLump/config.json`** with a small starter config. For **`config.js`** instead:

```bash
lumpcode lump-create myFirstLump --config js
```

For **`config.ts`**:

```bash
lumpcode lump-create myFirstLump --config ts
```

`lump-create` gives you one path template plus `@{FILE}` in the prompt; Step 3 is where you reshape that for your lump.

---

## Step 3: Define contexts

`contextListJson` maps variable names to path **templates**. Lumpcode scans the repo for every value the `{NAME}` placeholder can take such that the template resolves to a real path — each match becomes one **context**. Each map **key** becomes a **`{VAR}`** you can use in `promptTemplate` (write **`@{VAR}`** for agents that treat `@path` as file context).

Edit your scaffolded config (`lump-create` defaults look like this — adjust the path template and prompt to your repo):

```json
{
  "$schema": "https://lumpcode.com/schemas/lumpConfig.schema.json",
  "contextListJson": {
    "FILE": "src/{NAME}.ts"
  },
  "prompt": {
    "promptTemplate": "Improve the code at @{FILE}.",
    "command": "copilot"
  }
}
```

The base branch comes from the merged project/local primary (`primaryBranch` or the first entry of `primaryBranches`). Add a per-lump `"baseBranch": "release/2.0"` only if this lump needs to branch off something else.

A richer pattern (several files per context, naming-convention transforms) is shown in the [README's React-component example](../README.md#configjson-example-one-branch-per-react-component). More ways to define contexts — transforms, ordering and dependencies, fully custom sourcing: [lump-config.md § contextListJson](./lump-config.md#contextlistjson).

---

## Step 4: Run once

```bash
lumpcode run myFirstLump
```

In one tick, Lumpcode loads the lump, resolves contexts from remote status, preflights the execution workspace (fetch / switch / hard-reset, not `git pull`), prepares the work branch `lump/myFirstLump/…`, runs your agent, commits with the **`LUMP: myFirstLump - <contextName>`** marker (see Terms above), pushes to **`origin`**, tears down the branch workspace, and refreshes **`contextStatusRecord.json`**. Shared vs dedicated order and every hook call site: [advanced-config.md § Hook lifecycle](./advanced-config.md#hook-lifecycle). Short overview: [concepts.md § One run, end to end](./concepts.md#one-run-end-to-end).

**Workspace:** `local.json.mode` decides where the run happens — `shared` uses **`~/.lumpcode/project-copies/<projectName>/`** (a copy of your repo); `dedicated` uses **this checkout** in place (destructive reset). [concepts.md § Pre-flight and modes](./concepts.md#pre-flight-and-modes) · [local-config.md](./local-config.md)

**Sanity checks:**

```bash
git fetch origin
git log --remotes -F --grep='LUMP:' --oneline
lumpcode lump-status --lumpName myFirstLump
```

Do **not** confuse **`lump-status`** (context rows from git) with **`daemon-status`** (scheduler process)—[commands.md](./commands.md#three-commands-that-mention-status).

---

## Step 5: Run continuously (optional)

```bash
lumpcode start
```

`start` runs a detached background daemon on a cron schedule (default every 5 minutes), ticking every enabled lump. Use **`lumpcode daemon-status`**, **`lumpcode daemon-log`**, **`lumpcode stop`**, and **`lumpcode restart`** to manage it.

| If you… | Prefer |
|---------|--------|
| Want **one lump**, **one batch**, then return to the shell | **`lumpcode run myFirstLump`** |
| Leave a machine running and tick **all lumps** on a timer | **`lumpcode start`** |

Details — cron flags, caps, trade-offs: [concepts.md § When to use run vs start](./concepts.md#when-to-use-run-vs-start-daemon).

### Optional (dedicated): push a daemon file

On a **dedicated** worker you can keep only the supervisor up and let git start schedulers:

1. Set `local.json.mode` to `"dedicated"` on that machine.
2. Run `lumpcode start --superviseOnly` (no daemon yet).
3. Commit a recipe at `.lumpcode/daemons/<daemonId>.json` with an exact `discoveryBranch` that matches an expanded primary (for example `"dev"`), then push that branch to your git remote.
4. After the next successful supervise reconcile, `lumpcode daemon-status` shows that `daemonId` with `daemonConfigFile` in meta.

Recipe format and collision rules: [concepts.md § Repo daemon config files](./concepts.md#repo-daemon-config-files). Shared mode does not start daemons from repo files.

---

## Where your work lives

| Artifact | Location |
|----------|----------|
| Lump configs | `.lumpcode/lumps/<lumpName>/` |
| Project name + team defaults (primary, command, …) | `.lumpcode/project.json` (commit) |
| Per-machine mode (+ optional overrides) | `.lumpcode/local.json` (gitignored) |
| Context status cache | `.lumpcode/lumps/<lumpName>/contextStatusRecord.json` |
| Prompt run history (optional, `keepHistory: true`) | `.lumpcode/lumps/<lumpName>/history/<contextName>.yaml` (gitignored) |
| TypeScript transpile cache | `.lumpcode/.cache/transpile/` (gitignored) |
| Default work branch names | `lump/<lumpName>/<context…>` (local + `origin`) |
| Isolated repo copy (when `local.json.mode` is `shared`) | `~/.lumpcode/project-copies/<projectName>/` |
| Background daemon PID / logs | `~/.lumpcode/daemons/` |

Commit `.lumpcode/` if you want lump definitions and status tracked in git; omit secrets and machine-only paths from shared configs.

---

## Next steps

You now have your first working lump ! Browse when you need more depth:

- [concepts.md](./concepts.md) — Lifecycle diagrams and workspace details
- [commands.md](./commands.md) — Every subcommand and flag
- [local-config.md](./local-config.md) — `.lumpcode/local.json` (`mode`, `primaryBranch`)
- [lump-config.md](./lump-config.md) — All lump config keys
- [advanced-config.md](./advanced-config.md#hook-lifecycle) — Lifecycle schemas (shared / dedicated), dynamic `steps`, custom commands
- [types.md](./types.md) — Hook parameter shapes
- [examples.md](./examples.md) — Short smoke-test style recipes
