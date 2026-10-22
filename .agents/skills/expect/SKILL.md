---
name: expect
description: >-
  Drafts an expect.yml scope contract (files, +/- line estimates, create/update/delete
  symbols) from a requirement or conversation, before any code is written. Use when
  the user asks to write expect.yml, create an expect, run /radius:expect, or
  to formalize a change before an agent implements it.
disable-model-invocation: true
---

# Expect

Write the change **before** it exists. An `expect.yml` is the non-prose prior: the scope contract an implementer matches and a reviewer diffs against. A human still reviews it thoroughly before implementation. If the first time anyone sees it is inside the impl PR, it is late.

To **implement** against an existing expect, use `impl` (`/radius:impl`). To **measure drift**, use `drift` (`/radius:drift`). Do not implement in the same turn as writing the expect.

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

| Field | Required | Rule |
| --- | --- | --- |
| `desc` | yes | One sentence for humans. The whole-slice intent, not a file dump. |
| `files` | yes | Repo-relative paths that should move. Keys are the expect. |
| `files.*.desc` | yes | What this file should do in the PR. |
| `files.*."-"` / `"+"` | no | Expected size, not a pass or fail. Prefer including them. |
| `files.*.symbols` | no | Not exhaustive. Only names already cared about. Values: `create`, `update`, `delete`. |

Quote `"-"` and `"+"` as YAML keys. Omit empty `symbols` maps.

Do not use the legacy shape (path keys at the root, `change` instead of `desc`). If a file already has that shape, rewrite it to this shape when asked to create or update the expect.

Place the file next to the work it describes: beside a ticket, a requirements doc, or at a path the user names. Default filename is `expect.yml`. Do not invent a floating expect with no home; ask where it lives.

`blast.yml` is the old filename. Still read it. New writes use `expect.yml`.

## Process

### 1. Resolve the work

- If the user named a path or item, use that folder.
- Else infer from the conversation, current branch, or an open PR (`git branch --show-current`, `gh pr view` when a PR exists).
- Ambiguous: list the top candidates and ask once.
- Read the requirement, ticket, or conversation in full. Then open the real files those contracts name. Do not invent paths or symbol names.

### 2. Read the plan, then the code

An expect is a file-and-symbol map, not a restatement of requirements. Pin:

- which existing files change, and which new paths are created
- the exported functions, types, or constants that are the point of the edit
- rough `-/+` from the current file size and the intended edit (new file: `"-": 0`)

Before writing, search the repo for other `expect.yml` and `blast.yml` files. If another expect already lists a file you would list, say so: those two changes should run sequentially to avoid conflicts.

### 3. Split if it does not fit in your head

The file list has to fit in one head. If it does not, the PR will not either. Do **not** write a 15-file expect for two intents.

Signals to stop and propose a split instead of one expect:

- More than about 8 production files (barrels and tiny tests do not count against this as hard)
- Two separable intents (extract + migrate, docs + engine, two packages with no shared contract)
- A wide mechanical fan-out (expand–contract batches, not one expect)

Present the split, then write one expect per approved slice.

### 4. Draft the entries

**Files to list**

- Every path the implementer should touch, including the test and barrel that exist only because a listed module exists.
- Skip drive-bys (unrelated lint, docs the work did not call for).
- Docs-only or yaml-only paths: `desc` + size; omit `symbols`.

**Symbols** (`create` / `update` / `delete`)

- Names you already know must change: the new helper, the caller that drops an inlined block, the type that moves.
- Not a complete export list. Skip locals, test aliases, and re-exports unless the re-export *is* the change.
- `create` — new name in this file (or this file is new and defines it).
- `update` — existing name in this file whose role or body is the edit.
- `delete` — name removed from this file.
- CSS names work: `--bg`, `.hero`. Quote selectors that contain `:` (`".skip:focus"`).
- Prefer source-of-truth names, not the barrel line, unless the expect is the barrel.

**Sizes**

- Estimate the intended edit, not a budget. Stay close enough that a 2× miss would surprise you.
- Tests may be larger and looser than `src/`. Barrels are usually `+` 1–3.

### 5. Show the draft, then write

Show the full YAML in chat. Call out any guess (a path you have not opened, a size that is a stab). Ask whether to split or drop files.

Write `expect.yml` when the user approves, or immediately when they asked to write the file and the path is unambiguous. Do not implement the change in the same turn.

Then check the file is grounded in the tree (from this skill directory, or the installed plugin):

```bash
node scripts/validate-expect.mjs --expect <path-to-expect.yml>
```

It fails when a listed path should already exist and does not, or when an `update` symbol is not in that file. New files (`"-": 0` and only `create` symbols) may be missing. Quote selectors that contain `:` (`.skip:focus`). Fix any issues before handing the expect to `/radius:impl`.

After writing, say this is the review they can still change. Implementation is `/radius:impl`: prefer the listed files and stay close to the line estimates.
