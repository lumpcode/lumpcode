# Core terms

Lumpcode has a small vocabulary. Five words carry most of the docs.

| Term | Meaning |
| --- | --- |
| **Lump** | One campaign: a folder at `.lumpcode/lumps/<lumpName>/` with a config that says what to work on, what to prompt, and which agent. |
| **Context** | One unit of work in a lump: a file, a component and its test, a ticket, a package. It has a `name` and `variables` that fill `{VAR}` in prompts. |
| **Marker commit** | The commit Lumpcode writes for a finished context: `LUMP: <lumpName> - <contextName>`. Lumpcode knows what is done by finding that line on your git remote. |
| **Worker** | A clone you never edit, running `lumpcode start`. Each **daemon** on it is one scheduler. |
| **Project** | A git repo with a `.lumpcode/` folder. |

A context is not "one file" by definition, and not "one PR" either. Several contexts can share a branch with `numberOfContextsPerBranch`.

Designing the loop that prompts your agent, instead of prompting it yourself, is **loop engineering**. A lump is one such loop, written down in your repo.

## Status

Each context is in one of three states, read from your git remote:

<ol class="docs-status">
<li><strong>toDo</strong>: no marker commit on the remote yet.</li>
<li><strong>branchPushed</strong>: the marker is on a pushed branch, not merged.</li>
<li><strong>finished</strong>: the marker is on the base branch, usually because you merged the PR.</li>
</ol>

Runs are **resumable**: finished contexts are skipped. `branchPushed` is not finished, so a context that `dependsOnContexts` another waits until you merge.

If a squash drops the `LUMP: …` line, the context looks `toDo` again. Keep the line, or run `lumpcode context-status <lumpName> <contextName> --setToFinished`.

## Two modes

Each machine sets a mode in its gitignored `.lumpcode/local.json`:

| Mode | Where | What `lumpcode run` does |
| --- | --- | --- |
| `shared` | Your laptop | Runs the agent on your current branch. Dirty tree OK. No reset, no push. |
| `dedicated` | A worker clone | Resets the clone to the remote, cuts `lump/<lumpName>/…`, commits, pushes. Wipes uncommitted work. |

`lumpcode start` (the worker) only runs in `dedicated` mode.

## Branches

- **Primary branch**: your integration branch (`main`, `dev`), set in `project.json` or `local.json`.
- **Base branch**: where a lump's work branches off and where `finished` is read. The primary unless the lump sets `baseBranch`.
- **Work branch**: on a worker, `lump/<lumpName>/<contextName>` by default. That is what you open as a PR.

## Words you will see in logs

- **Tick** or **pass**: one scheduler round. Find lumps, run the ones with work. Default every five minutes.
- **Supervisor**: a small process `lumpcode start` launches to restart daemons that die. You never run it yourself.
- **Execution workspace** and **branch workspace**: the clone Lumpcode runs in, and the folder the agent edits (the same folder, or a git worktree under `.lumpcode/worktrees/`).
