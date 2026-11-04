---
name: writer
description: >-
  Land one small wording improvement on the website or the docs, with
  explanation.md. Use when the writer lump runs.
disable-model-invocation: true
---

# Writer

Make one small writing improvement on the public site or the operator docs. One change, then stop.

## Where

- `packages/apps/website/` for landing and site chrome
- `packages/apps/cli/DOCS/` for the operator manual (the site renders these files)
- A README when it says the same thing as a page you are correcting

Read `.agents/memory/writing/` (`docs.md`, `website.md`, and `articles.md` when you touch `articles/`) and follow it. In particular: a lump is a software factory; a context is a unit of work; review is a pull request the operator merges; the CLI stops at `git push`.

## What to pick

A sentence that is wrong, stale, repeated, or harder to scan than the page around it. Fix the wording, the heading, or a cross-link. A page that is missing a fact an operator needs on that page is in bounds when the fix is a short addition.

Leave product code, config behavior, and new features to the other lumps. Leave a docs change that needs a new backlog decision to `IDEAS.yaml` by not doing it here.

## explanation.md

Write `.lumpcode/lumps/writer/explanation.md`:

```markdown
# <one line>

Which page changed, what was wrong with the wording, and the line you now stand behind.
```

Keep it to one screen. The pull request body is this file.
