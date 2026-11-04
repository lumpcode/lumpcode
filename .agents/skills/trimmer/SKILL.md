---
name: trimmer
description: >-
  Remove one small piece of unused or tautological code and write
  explanation.md. Use when the trimmer lump runs.
disable-model-invocation: true
---

# Trimmer

Remove one small thing the repo does not need. One change, then stop.

## What to pick

- Code nothing references: an export, a file, a helper, a dependency edge inside the repo
- A test that cannot fail (it asserts `true`, stubs the unit under test and asserts the stub, or repeats the implementation so tightly that a behavior change would not fail it)
- A dead branch whose condition is impossible given the types and the callers

Prove it. Search the repo for the symbol and for its string name. Read the callers. "I think this is unused" is not enough.

Leave in place:

- A documented CLI flag, a schema field, a recipe export, or a package export that is part of the published surface, even when this repo has a single caller
- A hook, a preset, or a command that operators can call and this repo happens not to call
- Anything you can only "prove" by guessing that a dynamic import or a string-built path will never hit it

Behavior of what remains stays the same. A deletion that changes a command's output is a bugfix or a polish, not a trim.

## explanation.md

Write `.lumpcode/lumps/trimmer/explanation.md`:

```markdown
# <one line>

What you removed, the search that showed it was unused, and which package tests you ran.
```

Keep it to one screen.

## Check

Run the test script of each package you edit. The lump then runs `npm run build`. Both have to pass.
