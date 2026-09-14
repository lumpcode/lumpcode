---
name: create-blast
description: Drafts or writes a backlog blast.yml (top-level desc, files, +/- line estimates, create/update/delete symbols) next to a ticket. Use when the user asks to create a blast, write blast.yml, prepare a blast, or review the change before any code exists.
---

# Create blast

Write the change **before** it exists. A `blast.yml` is the scope contract an implementer matches and a reviewer diffs against. A human still reviews the blast thoroughly before implementation. If the first time anyone sees it is inside the impl PR, it is late.

To **review** a branch or PR against an existing blast, use `blast-review`.

## Blast file

Lives next to the ticket `desc.yml`:

```text
.lumpcode/lumps/<lumpName>/backlogItems/todo/<kebab-name>/blast.yml
.lumpcode/lumps/<lumpName>/backlogItems/todo/<parent>/tickets/<kebab-name>/blast.yml
```

Canonical shape (same as the blast article):

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
| `files` | yes | Repo-relative paths that should move. Keys are the blast. |
| `files.*.desc` | yes | What this file should do in the PR. |
| `files.*."-"` / `"+"` | no | Expected size, not a pass or fail. Prefer including them. |
| `files.*.symbols` | no | Not exhaustive. Only names already cared about. Values: `create`, `update`, `delete`. |

Do not use the legacy shape (path keys at the root, `change` instead of `desc`). If a ticket already has that file, rewrite it to this shape when asked to create or update the blast.

Quote `"-"` and `"+"` as YAML keys. Omit empty `symbols` maps.

## Process

### 1. Resolve the ticket

- If the user named a path or item, use that folder.
- Else infer from the conversation, current branch, or an open PR (`git branch --show-current`, `gh pr view` when a PR exists) against `.lumpcode/lumps/**/backlogItems/{todo,completed}/**`.
- Ambiguous: list the top candidates and ask once.
- Need a `desc.yml` (and `requirements.md` when the ticket has one). If the folder is missing, ask whether to create the ticket first (`write-tickets`) instead of a floating blast.

### 2. Read the plan, then the code

Read `desc.yml` and `requirements.md` in full. Then open the real files those contracts name. Do not invent paths or symbol names.

A blast is a file-and-symbol map, not a restatement of requirements. Pin:

- which existing files change, and which new paths are created
- the exported functions, types, or constants that are the point of the edit
- rough `-/+` from the current file size and the intended edit (new file: `"-": 0`)

### 3. Split if it does not fit in your head

The file list has to fit in one head. If it does not, the PR will not either. Do **not** write a 15-file blast for two intents.

Signals to stop and propose a ticket split (`write-tickets`) instead of one blast:

- More than about 8 production files (barrels and tiny tests do not count against this as hard)
- Two separable intents (extract + migrate, docs + engine, two packages with no shared contract)
- A wide mechanical fan-out (expand–contract batches, not one blast)

Present the split, then write one blast per approved slice.

### 4. Draft the entries

**Files to list**

- Every path the implementer should touch, including the test and barrel that exist only because a listed module exists.
- Skip drive-bys (unrelated lint, AGENTS.md, docs the ticket did not call for).
- New util: list `main.ts`, `index.ts`, `unit.test.ts`, and the parent barrel when this repo's CLI util layout applies.
- Docs-only or yaml-only paths: `desc` + size; omit `symbols`.

**Symbols** (`create` / `update` / `delete`)

- Names you already know must change: the new helper, the caller that drops an inlined block, the type that moves.
- Not a complete export list. Skip locals, test aliases, and re-exports unless the re-export *is* the change.
- `create` — new name in this file (or this file is new and defines it).
- `update` — existing name in this file whose role or body is the edit.
- `delete` — name removed from this file.
- Prefer source-of-truth names (`acquireLock` in `main.ts`), not the barrel line, unless the blast is the barrel.

**Sizes**

- Estimate the intended edit, not a budget. Stay close enough that a 2× miss would surprise you.
- Tests may be larger and looser than `src/`. Barrels are usually `+` 1–3.

### 5. Show the draft, then write

Show the full YAML in chat. Call out any guess (a path you have not opened, a size that is a stab). Ask whether to split or drop files.

Write `blast.yml` when the user approves, or immediately when they asked to write the file and the ticket path is unambiguous. Do not implement the ticket in the same turn.

After writing, say the blast is the review they can still change. Implementation should point at the file, not restate the plan:

```
Read @blast.yml and try to match that blast if possible: prefer the listed files and stay close to the line estimates.
```
