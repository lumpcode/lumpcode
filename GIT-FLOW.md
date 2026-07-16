# Git flow

How we integrate work on `dev` and ship releases on `main`.

## Branches

| Branch | Role |
|--------|------|
| `dev` | Integration branch. Day-to-day development lands here. |
| `feat/*`, `fix/*`, `chore/*` | Short-lived work branches. Open PRs into `dev`. |
| `ver/X.Y.Z` | Optional stabilization branch before a release. Bugfixes only. |
| `main` | Production releases only. Tagged with `vX.Y.Z`. |

## Day to day

Rebase feature branches onto `dev` as needed:

```bash
git checkout feat/my-thing
git rebase dev
```

Open a PR into `dev`. Squash or merge commit is fine for feature PRs.

## Release (`vX.Y.Z`)

### 1. Cut a version branch (optional)

Skip this step for a simple release and merge `dev` into `main` directly.

```bash
git checkout dev
git pull
git checkout -b ver/X.Y.Z
```

Use `ver/*` when you need a freeze for final fixes while `dev` keeps moving.

### 2. Sync `main` into the release branch (if needed)

If `main` has hotfixes or you expect conflicts, merge `main` into the release branch and resolve there. **Do not rebase.**

```bash
git checkout ver/X.Y.Z
git merge origin/main
```

### 3. Merge into `main`

Open a PR: `ver/X.Y.Z` → `main` (or `dev` → `main`).

Merge with **Create a merge commit**. Do not use Rebase and merge or Squash and merge on release PRs.

### 4. Tag on `main`

Tag after the release merge lands on `main`:

```bash
git checkout main
git pull
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

Pushing `v*` triggers the GitHub release workflow (binaries). Publish npm separately with `node scripts/publish-npm.mjs`.

### 5. Sync `main` back into `dev`

Open a PR: `main` → `dev` (or merge via a sync branch if `dev` is protected).

Merge with **Create a merge commit**. This keeps `dev` aligned with what shipped.

## Rules

**Do**

- Rebase feature branches onto `dev`.
- Use merge commits for anything that touches `main`.
- Tag releases on `main` after the release merge.

**Do not**

- Rebase `ver/*` or `dev` onto `main` before a release. Rebasing rewrites commit SHAs, so the next release replays the same patches again under new SHAs.
- Use Rebase and merge on release PRs into `main`.

## Protected `dev`

If you cannot push directly to `dev`, use PRs for sync steps too:

1. **Heal / sync:** PR `main` → `dev`, merged with Create a merge commit.
2. **Post-release:** same, after tagging on `main`.

If `main` → `dev` has conflicts, branch from `dev`, merge `main` locally, push the branch, and open a PR into `dev`.

## Summary

```
feat/* ──rebase──► dev ──(optional ver/*)──merge commit──► main ──tag vX.Y.Z──► merge commit ──► dev
```

Rebase freely below `dev`. Use merge commits only across the `dev` / `main` boundary.
