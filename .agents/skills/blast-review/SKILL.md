---
name: blast-review
description: Reviews the current branch or open PR against a backlog blast.yml (listed files, change notes, +/- line estimates). Use when the user asks to review against blast, mentions blast.yml, or wants a blast-fit check on a PR or branch.
---

# Blast review

Compare the current branch (and its PR, if any) to a `blast.yml`. The blast is the scope contract: which files, what each should do, and roughly how large. Stay on blast fit. Do not turn this into a general code review.

## Blast file

A `blast.yml` lives next to a backlog item or ticket (`desc.yml`). Each key is a repo-relative path:

```yaml
packages/apps/cli/src/utils/example/main.ts:
  change: >-
    What this file should do in the PR.
  "-": 12
  "+": 40
```

`change` is the intended edit. `"-"` / `"+"` are line-estimate hints, not hard caps. Impl prompts say: prefer the listed files and stay close to the estimates.

## Resolve the blast

1. If the user named a path, use that file.
2. Otherwise infer one blast:

   - Current branch and PR title/body (`git branch --show-current`, `gh pr view` when a PR exists).
   - All `blast.yml` under `.lumpcode/lumps/**/backlogItems/{todo,completed}/**`.
   - Score each candidate: ticket/parent folder name in the branch or PR title; overlap between blast paths and the PR/branch file list.
   - Prefer the copy on this checkout (todo vs completed follows the branch).
   - One clear winner: use it and say why. Tie or weak overlap: list the top candidates and ask.

3. Read that blast in full before judging.

## Measure the PR

Use the PR base when a PR exists; otherwise `origin/dev`, then `origin/main`.

```bash
git diff --name-only <base>...HEAD
git diff --numstat <base>...HEAD
```

Read the actual diffs for listed files and for extras that look material. If the worktree is dirty, say so; the review is the committed range unless the user asks to include uncommitted changes.

`blast.yml` itself in the diff is normal. Ignore it as an "extra" unless the blast listed it.

## Judge fit

| Signal | Flag when |
| --- | --- |
| **Missing** | Blast path has no diff (and the `change` is not a no-op) |
| **Extra** | Changed path is not in the blast, especially a large or unrelated file |
| **Over / under** | Actual `-/+` is far from the estimate (about 2× and ≥20 lines off, or a small estimate that became a rewrite) |
| **Intent** | Diff does not do what `change` says (wrong behavior, different file role, drive-by rewrite) |

Small estimate misses (a few lines) are not findings. Necessary test/barrel/export extras can be notes, not failures, when they clearly serve a listed file. Sibling `requirements.md` may explain extras; the blast still wins on scope.

## Output (chat only)

Do not post GitHub review comments unless the user asks.

**Blast** — path used and how it was chosen.

**Fit** — one row per blast path, then extras:

| File | Blast −/+ | Actual −/+ | Change |
| --- | --- | --- | --- |
| `path` | 12 / 40 | 10 / 38 | match / drift / missing |

**Findings** — missing, extra, over/under, intent drift. Skip empty groups. Each finding: file, what the blast said, what the PR did.

**Verdict** — one of `matches` / `close` / `drifted`, plus one sentence. `matches` = listed files present, changes fit the notes, sizes close. `close` = small extras or modest size misses. `drifted` = missing listed work, large unlisted surface, or intent mismatch.
