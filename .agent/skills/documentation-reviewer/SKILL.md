---
name: documentation-reviewer
description: Reviews Lumpcode CLI documentation in packages/apps/cli/DOCS for concision, coverage gaps, and quality relative to sibling docs and product behavior. Use when improving CLI DOCS markdown, auditing a specific file in that folder, or when the user invokes documentation review for packages/apps/cli/DOCS.
disable-model-invocation: true
---

# Documentation reviewer (CLI DOCS)

## When to use

Apply when the user wants a structured review of Markdown under `packages/apps/cli/DOCS`, especially a single file they name.

## Instructions

1. **Scope**: Treat `packages/apps/cli/DOCS` as the doc set. Read the named file in full and skim other files in that folder for overlap, terminology consistency, and missing cross-links.
2. **Product alignment**: Where it matters for accuracy, spot-check the CLI and `@lumpcode/core` behavior (e.g. commands, options, lifecycle terms) so the doc does not contradict shipped behavior. Do not dump implementation paths or internal symbol names unless an operator truly needs them.
3. **User-facing style**: Prefer plain language; match existing CLI doc conventions (e.g. camelCase long options where the CLI uses them). Keep recommendations proportional—small edits over wholesale rewrites unless the file is clearly wrong.

## Review prompt

Work through this prompt for the file the user specifies (replace `{precise_doc_file}` with their path or filename, e.g. `commands.md` or `packages/apps/cli/DOCS/commands.md`):

Look at `packages/apps/cli/DOCS`, and particularly at {precise_doc_file} among all the documentation.
What could be done to make {precise_doc_file} more concise if needed? Does it miss anything it should cover? How can we make it better?

## Output

Answer in three short sections:

1. **Concision** — redundant sections, repeated ideas elsewhere in DOCS, tables or lists that could shrink, optional moves to progressive disclosure (link out vs inline).
2. **Coverage** — topics users of this doc expect that are absent, stale or ambiguous areas, and suggested additions (brief bullet list).
3. **Improvements** — concrete edits: structure, headings, examples, terminology consistency across DOCS, and cross-references to other files in the same folder when useful.

If the user did not name `{precise_doc_file}`, ask which file to focus on before reviewing.
