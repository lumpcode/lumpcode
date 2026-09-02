---
title: Core terms
description: The words Lumpcode uses, once, so the rest of the docs can stay short.
---

Lumpcode has a small vocabulary. If a later page feels dense, it is usually because one of these five is doing more work than it looks.

## The five you need

| Term | Meaning |
| --- | --- |
| **Project** | A git repo that contains both `.git/` and `.lumpcode/`. `lumpcode project-setup` creates the second folder. |
| **Lump** | One campaign, at `.lumpcode/lumps/<lumpName>/`. Config, prompts, and hooks live here. |
| **Context** | One unit of work inside a lump: a file, a group of files, a ticket, a package. It has a `name` and string `variables` that fill `{VAR}` in prompts. |
| **Marker commit** | The commit Lumpcode writes for a finished context. The subject is `LUMP: <lumpName> - <contextName>`. Status is that string on your git remote, nothing else. |
| **Worker** | `lumpcode start` on a clone you do not edit. It discovers lumps on a schedule and pushes branches. You merge from wherever you are. |

A context is **not** “one file” by definition. One context can hold a component plus its test. Several contexts can share one branch when you set `numberOfContextsPerBranch`.

## Status

Each context is in exactly one of three states, read from **remote** git history:

<ol class="docs-status">
<li><strong>toDo</strong> — no marker commit for this context on any remote ref yet.</li>
<li><strong>branchPushed</strong> — the marker exists on a branch other than the integration branch.</li>
<li><strong>finished</strong> — the marker is an ancestor of <code>origin/&lt;baseBranch&gt;</code>, usually because you merged the PR.</li>
</ol>

Re-running a lump is **resumable**: finished contexts are skipped. `branchPushed` is not finished. A later context that `dependsOnContexts` the first one waits until you merge.

If you squash and drop the `LUMP: …` line, Lumpcode forgets the work and the context looks `toDo` again. Keep the line in the squash message, or mark it by hand with `lumpcode context-status`.

## Three folders a run can touch

| Name | Where | What it is for |
| --- | --- | --- |
| **Project workspace** | Your repo | Config, status cache, history. In `shared` mode Lumpcode never checks this tree out for agent work. |
| **Execution workspace** | A copy under `~/.lumpcode/project-copies/…` in `shared` mode; this clone in `dedicated` mode | Git fetch, switch, reset. The repo the run actually uses. |
| **Branch workspace** | Same as execution (`checkout`), or `.lumpcode/worktrees/<branch>/` (`worktree`) | Where the agent runs and where `git add` / `git commit` happen. |

On a laptop, keep `mode: "shared"` so the copy is the thing that gets reset. On a worker clone you never edit, `mode: "dedicated"` is the point. Details: [local config](/docs/config/local).

## Branches Lumpcode cares about

- **Primary branch** — the integration line from `.lumpcode/project.json` (often `main` or `dev`). Local config can override it.
- **Base branch** — the branch this lump’s work branches off, and the branch whose remote history counts as `finished`. Usually the primary. Set a lump `baseBranch` only when this campaign should land somewhere else.
- **Work branch** — default `lump/<lumpName>/<contextName>`. That is what you open as a PR.

Dedicated workers can scan several primary lines (`dev` plus `feature/*`). Shared mode on your laptop does not. See [how a run works](/docs/start/run) and [local config](/docs/config/local).

## Words you will see in the CLI

`lumpcode start` still talks about a **daemon** in flags and filenames (`daemon-status`, `daemon-log`, `--daemonId`). On this site the product name for that process is **worker**. Same command.

A **tick** is one scheduler pass: discover lumps, run the ones that match. `lumpcode run <lumpName>` is one tick for one lump, then exit.
