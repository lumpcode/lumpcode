---
name: blast-review
description: Reviews the current branch or open PR against a backlog blast.yml (files, desc, +/- estimates, create/update/delete symbols). Use when the user asks to review against blast, mentions blast.yml, or wants a blast-fit check on a PR or branch.
---

# Blast review

Compare the current branch (and its PR, if any) to a `blast.yml`. The blast is the scope contract: which files, what each should do, roughly how large, and which named symbols must move. Stay on blast fit. Do not turn this into a general code review.

To **write** a blast before code exists, use `create-blast`.

## Blast file

A `blast.yml` lives next to a backlog item or ticket (`desc.yml`). Canonical shape (same as the blast article):

```yaml
desc: "Extract acquireLock so setup and teardown share one release callback."
files:
  src/lock.ts:
    desc: "New helper: acquire and release the path lock."
    "-": 0
    "+": 40
    symbols:
      acquireLock: create
      releaseLock: create
  src/run.ts:
    desc: "Call acquireLock. Drop the inlined lock block."
    "-": 12
    "+": 8
    symbols:
      run: update
```

`desc` (top-level) is for humans. `files` is the blast. Per-file `desc` is the intended edit. `"-"` / `"+"` are expected size, not a pass or fail. `symbols` are not exhaustive: `create`, `update`, or `delete` for names already cared about.

**Legacy files** (path keys at the root, `change` instead of `desc`, no `files` / `symbols`): still review. Treat each root path as a `files` entry and `change` as `desc`. Skip the symbol column.

Impl prompts say: prefer the listed files and stay close to the estimates.

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

Read the actual diffs for listed files and for extras that look material. For each listed symbol, check the file diff (and the resulting file) for that name:

| Action | Match when |
| --- | --- |
| **create** | Symbol is added (new export/function/type, or new file that defines it) |
| **update** | A hunk touches that symbol (signature, body, or call-site role in this file) |
| **delete** | Symbol is removed from this file (or the file is deleted) |

If the worktree is dirty, say so; the review is the committed range unless the user asks to include uncommitted changes.

`blast.yml` itself in the diff is normal. Ignore it as an "extra" unless the blast listed it.

## Judge fit

| Signal | Flag when |
| --- | --- |
| **Missing** | Blast path has no diff (and the `desc` is not a no-op) |
| **Extra** | Changed path is not in the blast, especially a large or unrelated file |
| **Over / under** | Actual `-/+` is far from the estimate (about 2× and ≥20 lines off, or a small estimate that became a rewrite). Tighter on `src/` than on tests. Small misses (a few lines) are not findings. |
| **Intent** | Diff does not do what `desc` says (wrong behavior, different file role, drive-by rewrite) |
| **Symbol** | Listed symbol did not move as declared (create missing, update never touched, delete still present) |

Necessary test/barrel/export extras can be notes, not failures, when they clearly serve a listed file. Sibling `requirements.md` may explain extras; the blast still wins on scope. Unlisted symbols are not findings (`symbols` is not exhaustive).

## Output (chat only)

Do not post GitHub review comments unless the user asks.

**Blast** — path used and how it was chosen. Quote the top-level `desc` when present.

**Fit** — one row per blast path, then extras:

| File | Blast −/+ | Actual −/+ | Symbols | Change |
| --- | --- | --- | --- | --- |
| `path` | 12 / 40 | 10 / 38 | `run` update · match | match / drift / missing |

**Findings** — missing, extra, over/under, intent drift, symbol miss. Skip empty groups. Each finding: file, what the blast said, what the PR did.

**Verdict** — one of `matches` / `close` / `drifted`, plus one sentence. `matches` = listed files present, changes fit the notes, sizes close, listed symbols moved. `close` = small extras or modest size misses. `drifted` = missing listed work, large unlisted surface, intent mismatch, or a listed symbol that did not move.
