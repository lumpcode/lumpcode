---
name: drift
description: >-
  Measures how far a branch or PR drifted from an expect.yml: files, sizes, and
  listed symbols. Explains the gaps. Use when the user asks to check drift,
  compare against expect.yml, or run /radius:drift. Helps the reviewer focus
  on the changes that look most unexpected.
disable-model-invocation: true
---

# Drift

Compare the current branch (and its PR, if any) to an `expect.yml`. The expect is the scope contract: which files, what each should do, roughly how large, and which named symbols must move. Stay on drift from that contract. Do not turn this into a general code review.

To **write** an expect before code exists, use `expect` (`/radius:expect`). To **implement** against an expect, use `impl` (`/radius:impl`).

## expect.yml

Canonical shape:

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

`desc` (top-level) is for humans. `files` is the expect. Per-file `desc` is the intended edit. `"-"` / `"+"` are expected size, not a pass or fail. `symbols` are not exhaustive: `create`, `update`, or `delete` for names already cared about.

**Legacy files** (filename `blast.yml`, or path keys at the root with `change` instead of `desc`): still measure. Treat each root path as a `files` entry and `change` as `desc`. Skip the symbol column.

Impl says: prefer the listed files and stay close to the estimates.

## Resolve the expect

1. If the user named a path, use that file.
2. Otherwise infer one expect:

   - Current branch and PR title/body (`git branch --show-current`, `gh pr view` when a PR exists).
   - All `expect.yml` and `blast.yml` files in the repo (`git ls-files '*expect.yml' '*blast.yml'` and untracked matches).
   - Score each candidate: folder name in the branch or PR title; overlap between expect paths and the PR/branch file list.
   - One clear winner: use it and say why. Tie or weak overlap: list the top candidates and ask.

3. Read that file in full before judging.

## Measure the PR

Run the checker first (from this skill directory, or the installed plugin):

```bash
node scripts/check-expect.mjs --expect <path-to-expect.yml>
```

Add `--base <ref>` when the default base is wrong. Use `--json` when you want the structured report.

The script scores **files, sizes, and listed symbols** (including CSS custom properties and class selectors). You still judge **intent** by reading diffs.

Use the PR base when a PR exists; otherwise `origin/main`, then `main`. If the worktree is dirty, say so; the review is the committed range unless the user asks to include uncommitted changes.

```bash
git diff --name-only <base>...HEAD
git diff --numstat <base>...HEAD
```

Read the actual diffs for listed files and for extras that look material. For each listed symbol, check the file diff (and the resulting file) for that name:

| Action | Match when |
| --- | --- |
| **create** | Symbol is added (new export/function/type, CSS variable/class, or new file that defines it) |
| **update** | A hunk touches that symbol (signature, body, call-site role, or CSS token in this file) |
| **delete** | Symbol is removed from this file (or the file is deleted) |

`expect.yml` (and legacy `blast.yml`) in the diff is normal. Ignore it as an "extra" unless the expect listed it.

## Judge fit

| Signal | Flag when |
| --- | --- |
| **Missing** | Expect path has no diff (and the `desc` is not a no-op) |
| **Extra** | Changed path is not in the expect, especially a large or unrelated file |
| **Over / under** | Actual `-/+` is far from the estimate (about 2× and ≥20 lines off, or a small estimate that became a rewrite). Tighter on `src/` than on tests. Small misses (a few lines) are not findings. |
| **Intent** | Diff does not do what `desc` says (wrong behavior, different file role, drive-by rewrite) |
| **Symbol** | Listed symbol did not move as declared (create missing, update never touched, delete still present) |

Necessary test/barrel/export extras can be notes, not failures, when they clearly serve a listed file. Unlisted symbols are not findings (`symbols` is not exhaustive).

## Output (chat only)

Do not post GitHub review comments unless the user asks.

**Expect** — path used and how it was chosen. Quote the top-level `desc` when present.

**Fit** — one row per expect path, then extras:

| File | Expect −/+ | Actual −/+ | Symbols | Change |
| --- | --- | --- | --- | --- |
| `path` | 12 / 40 | 10 / 38 | `run` update · match | match / drift / missing |

**Findings** — missing, extra, over/under, intent drift, symbol miss. Skip empty groups. Each finding: file, what the expect said, what the PR did.

**Verdict** — one of `matches` / `close` / `drifted`, plus one sentence. `matches` = listed files present, changes fit the notes, sizes close, listed symbols moved. `close` = small extras or modest size misses. `drifted` = missing listed work, large unlisted surface, intent mismatch, or a listed symbol that did not move.
