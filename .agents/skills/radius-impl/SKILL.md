---
name: radius-impl
description: >-
  Implements a change to match an existing expect.yml: listed files, per-file
  desc, +/- estimates, and create/update/delete symbols. Use when the user asks
  to implement an expect, code against expect.yml, or run /radius-impl.
disable-model-invocation: true
---

# Impl

The expect is the scope contract. Implement it. Do not restate the plan in a new prompt, and do not grow the change past the file list.

To **write** an expect first, use `radius-expect` (`/radius-expect`). To **measure drift** after the fact, use `radius-drift` (`/radius-drift`).

Prefer the listed files and stay close to the line estimates.

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

`desc` (top-level) is the slice intent. `files` is the expect. Per-file `desc` is what to do in that file. `"-"` / `"+"` are expected size, not a budget to spend. `symbols` are not exhaustive: `create`, `update`, or `delete` for names already cared about.

**Legacy files** (filename `blast.yml`, or path keys at the root with `change` instead of `desc`): still implement. Treat each root path as a `files` entry and `change` as `desc`.

If there is no expect, stop. Do not invent one and code in the same turn — send the user to `/radius-expect`.

## Process

### 1. Resolve the expect

- If the user named a path, use that file.
- Else infer one expect from the conversation, current branch, or an open PR, against `expect.yml` and `blast.yml` files in the repo.
- Ambiguous: list the top candidates and ask once.
- Read that file in full before editing.

If another `expect.yml` or `blast.yml` already lists a file you would touch, say so. Those two slices should not land in parallel.

### 2. Read the listed files, then code

Open every path in `files` (and the current versions of symbols those entries name). Then implement:

| Expect says | You do |
| --- | --- |
| Listed path | Touch it. New path: create it. Existing path: do what `desc` says. |
| `create` symbol | Add that name in this file. |
| `update` symbol | Change that name in this file (signature, body, or its role here). |
| `delete` symbol | Remove that name from this file. |
| `-/+` | Stay close enough that a 2× miss would surprise you. Tests may run larger than `src/`. Barrels are usually `+` 1–3. |

**Stay on the expect**

- Do not edit a path the expect did not list, except a test or barrel that exists only because a listed module exists.
- Do not drive-by lint, rename, or docs.
- Do not "improve" past the file `desc`.
- Do not rewrite `expect.yml` unless the user asked to change the contract.
- Unlisted symbols may move if the listed edit requires it. Do not go hunting for extra cleanup.

If a listed path or symbol does not exist as the expect assumes, stop and say so. Do not silently expand the slice.

### 3. Glance at fit, then stop

After the edits:

```bash
git diff --numstat
```

If `../radius-drift/scripts/check-expect.mjs` is present, you may run it with `--expect <path>`. Either way: if you added an unlisted file, blew a size by about 2× and ≥20 lines, or skipped a listed path, fix it now or say why you cannot.

Do not turn this into `/radius-drift`. One short note: expect path, files touched, anything that missed. Then stop. Do not commit unless the user asked.
