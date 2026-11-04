# Worker pushes one branch per run, not per item

`DOCS/start/worker.md` opened with "a second clone of your repo that runs every lump on a schedule and pushes one branch per item". That lead is also the page description the site shows in search. It contradicted two things:

- Step 3 on the same page: "One `lump/<lumpName>/…` branch per run."
- Core terms (`DOCS/start/terms.md`): a context is not one PR, and `numberOfContextsPerBranch` puts several on one branch. The sweeps and issue-queue examples group 3, 5, and 10 per branch.

"Per item" reads as a promise that every unit of work gets its own branch, which is only true at the default of 1. The First PR page hands off to the worker with the same sentence, so I fixed both places together.

The line I now stand behind, on both pages:

> A worker is a second clone of your repo that runs every lump on a schedule and pushes one branch per run.

Also noticed but left alone: "Cap open PRs per lump with `maximumNumberOfConcurrentBranches`" (worker page, building blocks, examples overview). The setting counts pushed `lump/<name>/*` branches, not PRs. It appears on three pages, so fixing it is a separate change.
