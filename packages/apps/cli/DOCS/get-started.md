# Getting started with the Lumpcode CLI

Follow this guide in order to get started with your first `lumpcode run`. Links at each step point to more detail if you want it.

---

## Prerequisites

Install and prepare the following:

1. **Lumpcode CLI** on your `PATH` — Install globally: `npm install -g @lumpcode/cli` (Node 22+). For installation details: [README.md § Install](../README.md#install).
2. **Git** repository with **`origin`** reachable for fetch/push. The **`projectBaseBranch`** you'll declare in `.lumpcode/local.json` (typically `main`) must **already exist on `origin`** (e.g. `origin/main`): Lumpcode pulls it during pre-flight and reads it via `origin/<projectBaseBranch>` for status.
3. **CLI coding agent** installed and runnable. Lumpcode invokes the **`command`** you set in lump config by resolving a command module in this order: `.lumpcode/commands/<name>.js` (project), then `~/.lumpcode/commands/<name>.js` (global override), then shipped presets at `~/.lumpcode/commands/presets/<name>.js`. Built-in preset names **`cursor`** and **`copilot`** work out of the box when `cursor-agent` or `copilot` is on `PATH`; other agents (e.g. **`aider`**) need a custom module until more presets ship.

---

## Terms you need for this tutorial

| Term | Meaning |
|------|---------|
| **Project** | A folder with git that contains both `.git/` and `.lumpcode/` (the CLI adds `.lumpcode/` once you initialize). |
| **Lump** | One **agent loop campaign** in your repo: context discovery, prompt(s), agent command and other config details under `.lumpcode/lumps/<lumpName>/`. |
| **Context** | One unit of work inside a lump (e.g. one file or one component). Each context has a **name** and **variables** filled into your prompt. |
| **Marker commit** | The commit subject for one context is always **`LUMP: <lumpName> - <contextName>`** on the remote. Lumpcode uses that to know what is already done. |
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
├── project.json      # project name and optional project-wide settings (commit this)
├── local.json        # per-machine mode + projectBaseBranch (gitignored)
├── lumps/            # one folder per lump
└── commands/         # optional custom agent command modules (.js)
```

**`project.json`** stores **`projectName`**: letters, digits, `_`, and `-` only. If you omit **`--projectName`**, `project-setup` infers a name from **`origin`** or the directory basename and normalizes it to those rules. That same value is used for daemon files and for `~/.lumpcode/project-copies/<projectName>/` when `local.json.mode` is `shared`—Lumpcode does not rename or “slug” it at runtime.

**`local.json`** is per machine and gitignored. The default is:

```json
{
  "mode": "shared",
  "projectBaseBranch": "main"
}
```

Keep `shared` on your workstation (Lumpcode never touches your checkout — it runs in a separate copy). Edit it to `"dedicated"` on a server / daemon machine that you don't develop on. Full reference: [local-config.md](./local-config.md).

Optional flags:

- `--projectPath <dir>` — Initialize another directory (default: current working directory).
- `--projectName <name>` — Stored verbatim; must already satisfy the character rules (see [project-config.md](./project-config.md#projectname-rules)).
- `--mode <shared|dedicated>` — Initial `local.json.mode` (default `shared`).
- `--projectBaseBranch <branch>` — Initial `local.json.projectBaseBranch` (default `main`).

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

`lump-create` gives you one path template plus `@{FILE}` in the prompt; Step 3 is where you reshape that for your lump.

---

## Step 3: Define contexts

`contextListJson` maps variable names to path **templates** (e.g. `{NAME}`, `{COMPONENT_NAME}`). Lumpcode scans the repo and keeps only combinations where **every** template resolves to a real path; each map **key** is a **`{VAR}`** in `promptTemplate`, or **`@{VAR}`** with a leading `@` for agents that treat `@path` as file context. Substitution rules: [lump-config.md § Prompt template syntax](./lump-config.md#prompt-template-syntax).

**Two examples below:** a **minimal** stub (one `{NAME}` pattern) and a **repeat-per-component** pattern (multi-path contexts with `$upperFirst{…}`). Replace paths, prompts, and `command` with your real lump.

Minimal stub (`lump-create` defaults look like this—adjust `FILE`/prompt):

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

Repeat-per-component variant (multiple paths must exist per context—the prompt is identical in spirit every time Lumpcode discovers the next matched folder/file set):

```json
{
  "contextListJson": {
    "FOLDER": "src/components/{COMPONENT_NAME}/",
    "COMPONENT": "src/components/{COMPONENT_NAME}/$upperFirst{COMPONENT_NAME}.tsx"
  },
  "prompt": {
    "promptTemplate": "Migrate the component at @{COMPONENT} (folder @{FOLDER}) to Vue 3 <script setup>.",
    "command": "copilot"
  }
}
```

The base branch comes from `.lumpcode/local.json.projectBaseBranch`. Add a per-lump `"baseBranch": "release/2.0"` only if this lump needs to branch off something else.

Transforms (e.g. `$upperFirst{…}`) and **`contextOptionsFn`** for `priority` / `dependsOnContexts` (including cross-lump `otherLumpName/contextName`): [lump-config.md § contextListJson](./lump-config.md#contextlistjson) and [§ Context ordering](./lump-config.md#context-ordering-and-cross-lump-dependencies). Fully custom sourcing: **`getContextListFn`** / **`contextMatchFn`** ([lump-config.md](./lump-config.md), [advanced-config.md](./advanced-config.md)).

---

## Step 4: Run once

```bash
lumpcode run myFirstLump
```

In one tick, Lumpcode first runs **pre-flight** (pulls `projectBaseBranch` from `local.json` in the resolved workspace), then picks the next context(s); prepares the work branch `lump/myFirstLump/…`; runs your agent; commits with the **`LUMP: myFirstLump - <contextName>`** marker (see Terms above); pushes to **`origin`**; refreshes **`contextStatusRecord.json`**; and finally switches the workspace back to `projectBaseBranch`.

**Workspace:** `local.json.mode` decides where the run happens — `shared` uses **`~/.lumpcode/project-copies/<projectName>/`** (a copy of your repo); `dedicated` uses **this checkout** in place (destructive reset). [concepts.md § Pre-flight and modes](./concepts.md#pre-flight-and-modes) · [local-config.md](./local-config.md)

**Sanity checks:**

```bash
git fetch origin
git log --remotes --grep '^LUMP:' --oneline
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

---

## Where your work lives

| Artifact | Location |
|----------|----------|
| Lump configs | `.lumpcode/lumps/<lumpName>/` |
| Per-machine mode + projectBaseBranch | `.lumpcode/local.json` (gitignored) |
| Context status cache | `.lumpcode/lumps/<lumpName>/contextStatusRecord.json` |
| Prompt run history (optional, `keepHistory: true`) | `.lumpcode/lumps/<lumpName>/history/<contextName>.json` (gitignored) |
| Default work branch names | `lump/<lumpName>/<context…>` (local + `origin`) |
| Isolated repo copy (when `local.json.mode` is `shared`) | `~/.lumpcode/project-copies/<projectName>/` |
| Background daemon PID / logs | `~/.lumpcode/daemons/` |

Commit `.lumpcode/` if you want lump definitions and status tracked in git; omit secrets and machine-only paths from shared configs.

---

## Next steps

You now have your first working lump ! Browse when you need more depth:

- [concepts.md](./concepts.md) — Lifecycle diagrams and workspace details
- [commands.md](./commands.md) — Every subcommand and flag
- [local-config.md](./local-config.md) — `.lumpcode/local.json` (`mode`, `projectBaseBranch`)
- [lump-config.md](./lump-config.md) — All lump config keys
- [advanced-config.md](./advanced-config.md) — Hooks, dynamic `steps`, custom commands
- [types.md](./types.md) — Hook parameter shapes
- [examples.md](./examples.md) — Short smoke-test style recipes
