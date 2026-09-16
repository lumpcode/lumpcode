# Getting started with the Lumpcode CLI

Readable website version: [lumpcode.com/docs/start/first-pr](https://www.lumpcode.com/docs/start/first-pr) · [docs](https://www.lumpcode.com/docs).

Follow this guide in order to get started with your first `lumpcode run`. The happy path is **`lumpcode setup`**. Links at each step point to more detail if you want it.

---

## Prerequisites

You only need a machine with your repo, git access, and a configured CLI agent. Install and prepare the following:

1. **Lumpcode CLI** on your `PATH` — Install globally: `npm install -g @lumpcode/cli` (Node 22+). Details: [README.md § Install](../README.md#install).
2. **Git** repository with **`origin`** reachable for fetch/push. The **`primaryBranch`** you'll declare must **already exist on `origin`** (e.g. `origin/main`). Shared `run` stays on this branch. Git **`user.name`** and **`user.email`** must be set so setup can commit.
3. **CLI coding agent** installed and runnable. Lumpcode invokes the **`command`** you set in lump config by resolving a command module in this order: `.lumpcode/commands/<name>.js` (project), then `~/.lumpcode/commands/<name>.js` (global override), then shipped presets at `~/.lumpcode/commands/presets/<name>.js`. Built-in preset names **`cursor`**, **`copilot`**, **`claude-code`**, **`opencode`**, and **`codex`** work out of the box when `cursor-agent`, `copilot`, `claude`, `opencode`, or `codex` is on `PATH`; other agents (e.g. **`aider`**) need a custom module.
4. **Lumpcode agent skill** (optional) — so your coding agent has current Lumpcode docs context: `npx skills add lumpcode/skills`. `lumpcode setup` offers this; you can also run it yourself.

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

You only need **`.git/`** here. The next step creates **`.lumpcode/`** in this same directory. After that, this folder is your **Lumpcode project root**.

---

## Step 1: Run `lumpcode setup`

From the repository root, on the branch you want to rehearse on:

```bash
lumpcode setup
```

Setup is interactive (needs a TTY; `--json` is rejected). It walks a fresh repo:

1. Preflight (git work tree, `origin`, identity, agents on `PATH`)
2. Optional skill install
3. Scaffold `.lumpcode/` (`project.json` committed later; `local.json` stays gitignored)
4. First JSON lump (`myFirstLump` by default; `README.md` when that file exists)
5. Pause so you can edit the config
6. Commit and push the allowlisted files (or print the commands)
7. Plan, then `run` in place on this branch

Shared success prints the current branch. Setup does not create a `lump/…` branch and does not open a pull request. It never starts a daemon. After the run, a TTY (not `--json`) can still show porcelain and `[c]` / `[e]` from `run`.

If `.lumpcode/` already exists, this command fails closed. Resume and dedicated `start` are separate flows.

**`--projectPath <dir>`** — Start from another directory (resolved to that git work tree).

### Flags-only init

CI and other non-interactive shells should keep using **`lumpcode project-setup`** (`--mode`, `--projectName`, `--primaryBranch`, `--projectPath`). That command only writes the `.lumpcode/` tree; it does not create a lump or run. Then `lump-create` / edit / `lump-plan` / `run` stay available as the manual path.

---

## Step 2: Leave a worker running (optional)

`lumpcode start` is **dedicated-only**. On this laptop (`mode: "shared"`) it fails. Clone the repo into a folder you never edit, set `mode: "dedicated"`, then:

```bash
lumpcode start
```

That daemon ticks every enabled lump on a cron (default every 5 minutes). Use **`lumpcode daemon-status`**, **`lumpcode daemon-log`**, **`lumpcode stop`**, and **`lumpcode restart`** to manage it.

| If you… | Prefer |
|---------|--------|
| Want **one lump**, **one batch**, on this branch | **`lumpcode run myFirstLump`** |
| Leave a worker running and tick **all lumps** on a timer | **`lumpcode start`** on a dedicated clone |

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
| Default work branch names (dedicated) | `lump/<lumpName>/<context…>` (local + `origin`) |
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
