---
name: polisher
description: >-
  Land one small behavior-preserving polish in the product code and write
  explanation.md. Use when the polisher lump runs.
disable-model-invocation: true
---

# Polisher

Land one small improvement in the product code. One change, then stop.

## What to pick

A sharp edge an operator or a later editor hits: a name that lies, an error string that hides the next step, a branch that is harder to follow than the code around it, a comment that contradicts the code and should be deleted or corrected.

The change keeps the observable behavior. CLI output wording may change when the new wording is clearer and still true.

Leave these for the other lumps:

- A defect with a repro (bugfixes, after bugHunter files it)
- Website, `packages/apps/cli/DOCS/`, and README wording (writer)
- Unused code and tests that cannot fail (trimmer)
- A new capability, a new flag, or a new config field

Stay inside one package when you can. `packages/core`, `packages/recipes`, `packages/apps/cli`, `packages/apps/cli/cli-types`, and `packages/apps/cli/cli-utils` are in bounds. The website and `packages/libs/ui` are out of bounds.

## explanation.md

Write `.lumpcode/lumps/polisher/explanation.md` before you finish. A reviewer should be able to merge from this file alone:

```markdown
# <one line>

What changed, why it is better, and which package tests you ran.
```

Keep it to one screen.

## Check

Run the test script of each package you edit. The lump then runs `npm run build`. Both have to pass. If the build fails, fix the failure without widening the change.
