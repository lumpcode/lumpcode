# `maximumNumberOfConcurrentBranches` caps branches, not PRs

`DOCS/start/worker.md` said: "Cap open PRs per lump with `maximumNumberOfConcurrentBranches` so the worker waits for your reviews." Two things were wrong:

- The setting does not count PRs. It counts `lump/<name>/*` branches on the remote (`countOpenLumpBranches`, `git ls-remote`). The CLI stops at `git push` and never sees a PR, so a branch with no PR counts the same as one under review. `DOCS/config/lump.md` already describes it correctly: "Skip the run when that many `lump/<name>/*` branches already exist on origin."
- "Waits for your reviews" suggests that merging frees a slot. It does not. Lumpcode never deletes a merged branch, and only `lumpcode clean` does. If the git host keeps head branches after merge, the cap stays full and the lump stops running without any error. This is the "worker does not pick up my lump" case, and the page that sets up the worker is where an operator needs to read it.

The line I now stand behind, on the worker page:

> Cap a lump's branches on the remote with `maximumNumberOfConcurrentBranches` so the worker waits for your reviews. A merged branch still counts until it is deleted: turn on your host's delete-branch-on-merge setting, or run `lumpcode clean --lumpName <name>`.

The same "PRs" claim also appeared on two example pages, so I changed it there to match without repeating the deletion detail:

- `DOCS/examples/building-blocks.md`: "Capping a lump's open branches is built in", now linking to the worker page section.
- `DOCS/examples/overview.md`: "stops the worker from piling up branches while you are away".

Noticed but left alone: in `DOCS/reference/troubleshooting.md`, step 4 of "Worker does not pick up my new lump" says "Merge or `lumpcode clean`". That has the same gap, because merging only helps if the host deletes the branch.
