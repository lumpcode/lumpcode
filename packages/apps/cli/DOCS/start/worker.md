# Leave a worker running

A worker is a second clone of your repo that runs every lump on a schedule and pushes one branch per item. You keep writing lumps and merging on your laptop. This is how Lumpcode is meant to run.

## A day with a worker

1. **Start it once.** On a clone you never edit, `lumpcode start` runs in the background and checks for work every five minutes.
2. **Push a new lump.** Nothing to deploy, register, or restart. The worker fetches your primary branch and finds the lump on its next pass.
3. **Branches arrive.** One `lump/<lumpName>/…` branch per run. You open the PR, adjust it if needed, and merge. The next pass skips what you merged.

## 1. Commit `.lumpcode/` first

Do the [First PR](first-pr.md) rehearsal on your laptop, then make sure `.lumpcode/` is committed and pushed. The worker reads lumps from git, not from your laptop.

Writing TypeScript lumps that import `@lumpcode/cli-utils` or `@lumpcode/recipes`? Add both to the project `package.json` before you push. The global CLI does not provide them.

## 2. Make a second clone

Clone the same repo into a folder you never edit. Another directory on your laptop is enough (`~/lumpcode-worker`). An always-on machine is an upgrade, not a requirement.

That clone needs:

- git fetch and push to `origin`, with `user.name` and `user.email` set
- Node.js 22+ and `npm install -g @lumpcode/cli`
- your CLI agent on `PATH`, already logged in

## 3. Start it

```bash
cd ~/lumpcode-worker
npm install            # only if your lumps import npm packages
lumpcode setup
```

`.lumpcode/` is already in git, so setup only writes this machine's `.lumpcode/local.json`. Pick **dedicated** mode, then a workspace strategy. Setup can start the worker for you; otherwise run `lumpcode start`.

```json .lumpcode/local.json
{
  "mode": "dedicated",
  "workspaceStrategy": "worktree",
  "maxParallelRun": 2
}
```

> [!WARNING]
> `mode: "dedicated"` hard-resets this clone to the remote before every run. Uncommitted work here is wiped. Never pick it for a checkout you also edit.

**Worktree or checkout.** Prefer `worktree`: each run gets its own folder under `.lumpcode/worktrees/`, and the worker can run several lumps at once (`maxParallelRun`). `checkout` (the default) switches this folder onto each lump branch and back, one lump at a time. Use it if worktrees do not work for your repo.

**`maxParallelRun`** is how many lumps run at once, worktree only. Keep `1` until the machine can handle two agent sessions.

## 4. Check on it

```bash
lumpcode daemon-status    # is it running, what is in flight, when is the next pass
lumpcode dashboard        # the same, live in a browser
lumpcode transcript --lumpName myFirstLump   # follow what the agent is doing
```

More in [Watch it work](observe.md).

## Day to day, on your laptop

- Add or change a lump, check it with `lumpcode lump-plan <lumpName>`, push, merge. The worker picks it up.
- Merge what is good. If you squash, keep the `LUMP: <lumpName> - <context>` line in the message, it is how Lumpcode knows the item is done.
- Pause a lump with `"disabled": true`, push, merge. The worker skips it and stays up.
- Cap open PRs per lump with `maximumNumberOfConcurrentBranches` so the worker waits for your reviews.

Changed `.lumpcode/local.json` or `project.json` on the worker? Run `lumpcode restart`. Lumps are re-read every pass; machine config is read once at start.

To run several filtered schedulers from committed files, see [Daemon files](../config/daemons.md).
