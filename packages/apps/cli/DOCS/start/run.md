# How a run works

What happens when you type `lumpcode run`, how a worker differs, and how Lumpcode remembers what is done without a database. This page is the canonical reference for branches, workspaces, and locks.

## One run, step by step

`lumpcode run myLump` does the same thing on every machine, except where the mode says otherwise:

1. **Prepare** (worker only). Fetch, switch, and hard-reset the clone to the remote branch.
2. **Load** the lump config. A `disabled` lump stops here with exit code 0.
3. **Pick work.** Build the context list, ask git which contexts are still `toDo`, skip those waiting on a dependency, sort by `priority`, take the next batch (one context unless `numberOfContextsPerBranch` says more).
4. **Branch** (worker only). Cut `lump/myLump/<context>` from the base branch, in place or in a worktree.
5. **Run the steps** for each context: your prompt or steps, your agent, your validation commands.
6. **Commit** (worker only) with `LUMP: myLump - <context>`, then **push** the branch.

On a laptop (`shared`), steps 1, 4, and 6 are skipped. The agent edits your current branch. At the end a terminal prompt offers `c` to commit with markers (no push) or `e` to leave the tree as is.

If a step fails, that context gets no commit and the run stops before pushing. The context stays `toDo` for the next run.

> [!TIP]
> `lumpcode lump-plan myLump --contexts --prompts` does steps 2 and 3 and prints the prompts, without calling the agent or touching git.

## Where "done" lives

There is no Lumpcode database. A context is finished when its marker commit is on `origin/<baseBranch>`.

```text status
toDo ──run + push──► branchPushed ──you merge──► finished
```

`.lumpcode/lumps/<lumpName>/contextStatusRecord.json` is only a cache, refreshed after each run and by `lumpcode lump-status`.

The marker is always:

```text commit
LUMP: <lumpName> - <contextName>
```

Lumpcode looks for it anywhere in the full commit message (`foo` does not match `foo-bar`). Keep it when you squash. If it is gone, run `lumpcode context-status <lumpName> <contextName> --setToFinished`.

## `run` or `start`

| You want | Command |
| --- | --- |
| One lump, one batch, then your shell back | `lumpcode run <lumpName>` |
| Every lump, on a schedule, unattended | `lumpcode start` on a [worker](worker.md) |

`start` runs every five minutes by default (`--cronSetup` to change). Each pass finds every lump on the branch it tracks, so a merged lump is picked up without a restart. Filter with `--include` / `--exclude`. Manage it with `daemon-status`, `daemon-log`, `stop`, `restart`, and see it with [`dashboard` and `transcript`](observe.md).

## Checkout or worktree

`workspaceStrategy` in `local.json` decides where a worker's agent runs:

- **`checkout`** (default): the clone itself switches to the lump branch, then back. One lump at a time.
- **`worktree`**: each run gets a linked git worktree at `.lumpcode/worktrees/<branch>/`. The clone stays on the base branch, and `maxParallelRun` can run several lumps at once.

Laptop `run` ignores this and always uses your current checkout.

## Several branches

Most projects have one primary branch. A worker can also scan several, for example `dev` and every `feature/*` branch:

```json .lumpcode/local.json
{
  "mode": "dedicated",
  "primaryBranches": ["dev", "feature/*"]
}
```

Two words matter then:

- **Discovery branch**: where the worker finds the lump. A lump opts in with `discoveryBranch` or `discoveryBranches` (globs allowed), which must match `primaryBranches`.
- **Base branch**: where the lump's work branches off and where `finished` is read. Defaults to the discovery branch. Set `baseBranch` to land somewhere else.

How each is resolved:

```text resolution
primary branch  = first exact entry of primaryBranches (or primaryBranch)
discovery       = --discoveryBranch flag
                | first exact discoveryBranch(es) entry on the lump
                | the primary branch
base branch     = lump baseBranch (string, or a function in JS/TS)
                | discovery
```

A lump whose discovery rules are only globs needs `--discoveryBranch <branch>` for manual commands. Laptop `run` ignores discovery rules; `lump-plan` and `lump-status` accept `--discoveryBranch` to preview what a branch would pick. `maximumNumberOfConcurrentBranches` counts open branches per lump across every branch it runs on.

## When two runs collide

Lumpcode locks the folder it is about to change, and separately locks the shared git database so worktrees do not race. A manual `run` **fails fast** if something holds the lock (`workspacePathBusy` or `gitCommonDirBusy`). A worker **waits** up to 15 minutes, then skips and retries next pass.

Locks left by a crash or `stop --force` clear themselves when the next run sees the holder is dead. Do not delete lock files by hand.
