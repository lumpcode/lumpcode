# Troubleshooting: merging does not free a `maximumNumberOfConcurrentBranches` slot

`DOCS/reference/troubleshooting.md`, "Worker does not pick up my new lump", step 4 said: "`maximumNumberOfConcurrentBranches` can skip while older `lump/<name>/*` branches are still open. Merge or `lumpcode clean --lumpName <name>`." The previous writer run flagged this line and left it for later. Two things were wrong:

- "Merge" is offered as the fix, but merging alone does nothing to the cap. `countOpenLumpBranches` counts every `lump/<name>/*` head on the remote (`git ls-remote`). Lumpcode never deletes a merged branch, so if the git host keeps head branches after merge, the lump stays skipped. An operator who is on this page has usually already merged and is still stuck. "Still open" adds to the confusion, because it sounds like PR state, which the CLI never sees.
- `lumpcode clean --lumpName <name>` is offered as if it were the same thing as merging. It deletes every remote and local branch of that lump, including branches still waiting for review (`discoverByGlob` in `commands/clean/main.ts`). That is a real fix for the cap, but the operator should know what they are throwing away before they run it.

The line I now stand behind:

> 4. `maximumNumberOfConcurrentBranches` skips the run while that many `lump/<name>/*` branches exist on the remote. A merged branch still counts until it is deleted, so delete merged branches or turn on your host's delete-branch-on-merge setting ([worker day to day](../start/worker.md#day-to-day-on-your-laptop)). `lumpcode clean --lumpName <name>` also frees the cap, but it deletes every branch of that lump, including ones you have not reviewed.

The link points to the worker page section that already explains the cap, so the page links to that explanation instead of repeating it.
