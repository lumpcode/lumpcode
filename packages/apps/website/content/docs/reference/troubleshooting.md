---
title: Troubleshooting
description: Status surprises, busy workspaces, a dedicated clone that reset itself, and a worker that ignores a new lump.
---

## Status looks `toDo` after I merged

The marker string `LUMP: <lumpName> - <contextName>` is missing from git history on `origin/<baseBranch>`. Squash and rebase drop the subject unless you keep that line in the squash message.

Fix: put the string back, or:

```bash
lumpcode context-status myLump myContext --setToFinished
```

That pushes an empty marker commit on the base branch. Use sparingly.

`branchPushed` is not `finished`. Dependencies wait on merge, not on a PR existing.

## `lump-status` versus `daemon-status`

| Command | Question |
| --- | --- |
| `daemon-status` | Is the worker process running? |
| `lump-status` | What is each context’s git state? |

They do not answer each other. [Commands](/docs/reference/commands#three-commands-named-status).

## `workspacePathBusy` / `gitCommonDirBusy`

Another `run` or worker holds the folder or the shared git lock. Manual `run` fails fast. A worker waits up to 15 minutes, then skips and tries next cron.

If you just `stop --force`d, the next acquire removes a stale lock when the PID is dead. You should not delete lock files by hand.

## Dedicated mode wiped my files

`mode: "dedicated"` hard-resets **this clone** to the remote branch before each run. That is why the [worker](/docs/start/worker) is a second folder you never edit. Laptops stay on `shared`.

There is no undo inside Lumpcode. Recover from git if the work was committed; if it was only in the working tree, it is gone.

## `local.json` missing

`run` and `start` require it. Run `lumpcode project-setup` on a new repo. On a worker clone, copy the mode file by hand (`{ "mode": "dedicated" }`); do not re-run `project-setup` if `.lumpcode/` is already in git.

## Worker does not pick up my new lump

1. The lump must be on the branch the worker tracks (usually the primary). Push and merge; wait for the next cron (default five minutes), or `lumpcode restart`.
2. `--include` / `--exclude` on that worker may filter it out.
3. Lump `"disabled": true` soft-skips (exit 0). Local `"disabled": true` pauses every lump on that machine.
4. `maximumNumberOfConcurrentBranches` can skip while older `lump/<name>/*` branches are still open. Merge or `lumpcode clean --lumpName <name>`.
5. Dedicated discovery allowlist: the lump’s `discoveryBranch` must match configured `primaryBranches`. Launch fails closed on a mismatch; check the worker log.
6. TypeScript lumps that import `@lumpcode/recipes` need `npm install` on the worker clone. The global CLI does not provide those packages.

## `lump-plan` succeeded, `run` did not

`lump-plan` does not pre-flight or take the workspace lock. `run` does. Typical deltas: missing `local.json`, git fetch failure, `workspacePathBusy`, agent binary missing from `PATH` on that machine, dedicated allowlist.

`--prompts` on `lump-plan` can throw inside your `promptFn` even though a default validate passed.

## Agent not found

The preset needs `cursor-agent`, `copilot`, `claude`, `opencode`, or `codex` on `PATH` **on the machine that runs the lump**. A laptop install does not help the worker VM. Log in / auth that CLI on the worker too.

## Context name rejected

Names must match `^[a-zA-Z0-9_-]+$` and be unique. No `/` in a context `name`. Use `/` only in `dependsOnContexts` as `otherLump/contextName`. Captures from path templates that include dots or spaces will fail; slug them in `contextMatchFn` / `getContextListFn`.

## Too many open branches, later scan lines starve

The cap is **per lump name**, across every discovery line. A dedicated worker that scans `dev` then `feature/*` can skip later lines while `dev` still has open `lump/<name>/*` branches. Merge, raise the cap, or split lumps.

## JSON config cannot see my function

Inline functions need `config.js` or `config.ts`. In JSON, `*Fn` fields are string paths to modules. Precedence if several configs exist: TypeScript wins.

## First PR looks like the prompt is wrong

That is the point of one context per branch. Tweak the prompt, push the lump, merge or close the bad PR. The next context uses the new prompt. Blast radius stays one review.
