---
title: How a run works
description: Lumpcode takes the next unfinished context, runs your agent, commits a marker, and pushes a branch. Git is how it remembers.
---

## One context, end to end

`lumpcode run myLump` (and each worker pass for that lump) does this:

1. Load the lump config. Soft-skip if the lump is `disabled`.
2. Resolve the context list, then ask git which of those names are still `toDo`.
3. Cap in-flight work if `maximumNumberOfConcurrentBranches` is set.
4. Create or check out the work branch (`lump/myLump/…` by default).
5. For each context in the batch: optional setup, walk `prompt` / `steps`, optional teardown, `git add` + commit with `LUMP: myLump - <contextName>`.
6. `git push` that branch to your git remote.
7. Tear the branch workspace down. Refresh the on-disk status cache.

Lumpcode never merges. You open the pushed branch as a pull request, change it if the agent missed, and merge when it looks right.

> [!NOTE]
> Preview without calling the agent: `lumpcode lump-plan myLump`. That validates config and can print contexts and prompts. It does not reset git, commit, or push.

## Where “done” lives

There is no Lumpcode database. A context is finished when its marker commit is on `origin/<baseBranch>`. Until you merge (or otherwise put that commit on the integration branch), the next run will not treat it as done.

```text status
toDo ──run + push──► branchPushed ──you merge──► finished
```

`dependsOnContexts` requires **finished**, not `branchPushed`. A ticket that waits on schema will sit until the schema PR is merged.

## `run` versus `start`

| You want | Command |
| --- | --- |
| One lump, one batch, then your shell back | `lumpcode run <lumpName>` |
| A machine that keeps going | `lumpcode start` on a [worker clone](/docs/start/worker) |

`start` discovers every loadable lump (unless you pass `--include` / `--exclude`) on a cron, default every five minutes. New lumps appear on the next pass after you merge them to the branch the worker tracks. Nothing to deploy or register.

Companion commands: `daemon-status`, `daemon-log`, `stop`, `restart`. Project-wide stop is `stop --all`. `start` also keeps a supervisor process up (`supervise --foreground`); you do not run that yourself.

Worker files under `~/.lumpcode/daemons/<project>.<id>.daemon.*`: `pid`, `log`, `meta.json`, `desired.json` (spawn recipe; `stopping: true` means drain). Supervisor files: `~/.lumpcode/supervisor/<project>.{pid,log,meta.json}`.

## Shared laptop versus dedicated worker

Before the agent runs, Lumpcode **pre-flights** the execution workspace: fetch the target branch, switch to it, `git reset --hard` to the remote (not `git pull`).

| `local.json` `mode` | Execution workspace | Use when |
| --- | --- | --- |
| `shared` (default) | `~/.lumpcode/project-copies/<projectName>/` | This clone is your editor. Lumpcode never touches it. |
| `dedicated` | This clone | A worker you do not develop in. Pre-flight **wipes uncommitted work**. |

[Get started](/docs/start/first-pr) is shared. [The worker](/docs/start/worker) is dedicated.

**Shared** loads config from your editor clone and pre-flights only the copy. **Dedicated** pre-flights this clone to a concrete discovery branch **before** config load, then pre-flights again at `baseBranch` for the run.

## Branch resolution

```text resolution
effectivePrimaryBranches = primaryBranches or [primaryBranch]
primary                  = first exact entry          # all-glob list is invalid
scanBranches             = expand globs (dedicated)   # shared: exact primary only

effectiveDiscovery       = --discoveryBranch
                         | first exact lump discovery rule
                         | fail if pattern-only without the flag

resolvedBaseBranch       = lump baseBranch (string or fn)
                         | effectiveDiscovery
```

Discovery is where a dedicated worker **finds** the lump. Base is where work **branches off** and where `finished` is read. Dedicated allowlist: each lump discovery rule must match configured (unexpanded) `primaryBranches`. Shared `run` ignores discovery rules (warns if you pass `--discoveryBranch`). Inspect commands can still filter with the flag.

The open-branch cap is **per lump name**, across every scan line.

## Checkout or worktree

`workspaceStrategy` in `local.json`:

- **`checkout`** (default) — the execution workspace switches onto the lump branch for the run, then back. One lump at a time in that folder.
- **`worktree`** — the agent runs in `.lumpcode/worktrees/<branch>/` (branch segments become folders: `lump/a/b` → `…/worktrees/lump/a/b`). The main tree can stay on the base branch. Needed if you want `maxParallelRun` > 1 on a worker. Execution-path lock is released after workspace setup; the git-object-db lock still serializes git.

## If two things try to run at once

Lumpcode takes a lock on the folder it is about to mutate, and a second lock on the shared git object database so linked worktrees do not race. Manual `lumpcode run` **fails fast** if another run holds the lock (`workspacePathBusy`). A worker **waits** (up to 15 minutes), then skips that lump and tries again next pass.

Stale locks after a crash or `stop --force` clear themselves when the next acquire sees a dead PID.

## Marker commits you should not rewrite away

Lumpcode always commits:

```text commit
LUMP: <lumpName> - <contextName>
```

`lump-status`, `clean`, and `context-status` look for that string **anywhere in the full commit message**. `foo` does not match `foo-bar`. Keep it when you squash. If it is gone, the context looks `toDo` until you restore the line or run `lumpcode context-status <lump> <context> --setToFinished`.
