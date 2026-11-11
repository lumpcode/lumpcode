# Learnings

## Expected
`desc.yml` (`directImpl`, no `dependsOn`): shared preflight copies the source checkout with `fs.cp` into `~/.lumpcode/project-copies/<projectName>/` when that directory is missing. A dirty source is copied with that dirt, and the following `git switch` in `resetProjectBaseBranch` fails. Before the copy, require an empty `git status --porcelain`. If the source is dirty, fail with a clear error and do not copy. No `requirements.md`, `testPlan.md`, or `expect.yml`.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/utils/runPreflight/main.ts` states that shared mode does not fetch, switch, reset, or copy, and that a dirty tree stays dirty. The shared branch still returns `sourceProjectRoot` immediately.
- `packages/apps/cli/src/utils/runPreflight/unit.test.ts` covers a dirty tracked edit: preflight succeeds, `README.md` stays `# dirty`, `HEAD` stays `main`, and `project-copies/` is not created.
- `learnings.md` (this file).

`npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` passed (1245 tests).

## Gap
No clean-tree check and no dirty-source error. Shared `runPreflight` does not copy, so there is no `fs.cp` step to guard and no shared `git switch`. Shared `run` does not call preflight.

## Adjustments
A dirty shared checkout must keep succeeding. Shared run is in place on this branch (`shared-in-place-run`); `assertSharedRunHead` allows dirty, staged, and ignored-only porcelain, and the docs say a dirty tree is fine. Failing porcelain here would reject that walk. The failure in the ticket (a dirty copy, then `git switch`) cannot occur: `ensureProjectCopy` is gone.
