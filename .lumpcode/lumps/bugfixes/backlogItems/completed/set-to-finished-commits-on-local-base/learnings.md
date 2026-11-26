# Learnings

## Expected

`desc.yml` asks `context-status --setToFinished` (`setContextToFinishedStatus`) to build the marker on the refreshed `origin/<baseBranch>` tip without touching `HEAD`, the index, or the working tree. A local base behind origin was rejecting the push and leaving stray marker commits; staged files were going into that commit.

`requirements.md` keeps the same signature and the already-finished no-op. After the status refresh, the marker is an empty commit whose parent is `origin/<baseBranch>`, created with plumbing such as `commit-tree`, then pushed to `refs/heads/<baseBranch>` on `origin`. The message and branch are quoted with `shellSingleQuote`. A missing remote branch or a rejected push fails and changes no local ref. `commands/context-status`, `@lumpcode/core`, `@lumpcode/recipes`, and docs stay unchanged. Tests cover a second clone ahead of local `main`, a feature branch with a staged file, a missing `origin` branch, and the existing empty-commit case asserted on `origin/main` only. `npm run test -w=@lumpcode/cli` is green. This item has no `testPlan.md` or `expect.yml`.

## Landed

Working tree only. The marker commit for this stage does not exist yet.

- `packages/apps/cli/src/utils/setContextToFinishedStatus/main.ts`
- `packages/apps/cli/src/utils/setContextToFinishedStatus/unit.test.ts`
- `.lumpcode/lumps/bugfixes/backlogItems/todo/set-to-finished-commits-on-local-base/learnings.md`

`setContextToFinishedStatus` still returns early when the context is `finished`. Otherwise it reads `origin/<baseBranch>`, builds the marker with `git commit-tree` from that tip's tree and that tip as the only parent, and pushes `<sha>:refs/heads/<baseBranch>`. It does not switch branches, commit on the local base, or touch the index. A missing remote branch fails with `Remote branch "origin/<baseBranch>" does not exist`. A rejected push still returns git's message and updates no local ref. The unit tests assert the marker on `origin/main` only, one empty commit whose parent is the other clone's commit while local `main` stays put, an unchanged feature branch with its staged file and working tree, and unchanged local refs when `origin` has no such branch. `npm run test -w=@lumpcode/cli` passed (175 files, 1370 tests) after `npm run build:bundle -w=@lumpcode/cli`, the same order CI uses.
