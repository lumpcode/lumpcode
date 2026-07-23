---
name: write-requirements
description: Write a concise requirements markdown file that captures the feature discussed in the current conversation, following this repo's requirements conventions. Use when the user asks to write, draft, or generate a requirements document, product requirements doc, or spec for the work being discussed.
---

# Write requirements

Turn the **full context of the current conversation** into one precise, concise requirements markdown file that follows this repo's existing requirements style.

## Before writing

1. **Synthesize the conversation.** Extract the feature, the decisions already made, constraints, and any open threads from everything discussed so far. The requirements document captures *this* feature, not a generic template.
2. **Resolve unknowns cheaply.** Read the files/code referenced in the conversation to state real contracts (types, schemas, paths, function names). Do not invent APIs.
3. **Ask when unclear.** This skill normally runs once the feature is fully decided, but you never know — if anything material is still ambiguous, contradictory, or missing after synthesizing, ask the user to clarify before writing. The requirements document must read as fully decided: never leave open questions in it. Resolve every gap with the user first so everything is entirely clear.
4. **Confirm the output path.** Repo convention: `.lumpcode/lumps/<lumpName>/backlogItems/todo/<kebab-name>/requirements.md`. Infer `<lumpName>` and `<kebab-name>` from context; if the target lump/item is ambiguous, ask once, otherwise proceed with the matching backlog item folder (create it with `desc.yml` if missing).



## Core principles

- **Contracts, not code.** Specify implementation *decisions* as contracts: API/function signatures, Zod/JSON schemas, config shapes, data shapes, file paths, CLI syntax, exit/JSON envelopes. Use tables and minimal signature sketches. Do **not** paste implementation, function bodies, or precise code snippets.
- **Most concise possible.** Straight to the point, easy to understand. Every line earns its place. Prefer tables over prose. Cut restating the obvious.
- **Match the repo.** Reuse the section set, the metadata table, and the tone of existing requirements documents (e.g. `.lumpcode/lumps/**/backlogItems/**/requirements.md`). Periods/commas over em dashes. Reference real files with relative links where helpful.



## Required structure

Adapt sections to the feature (omit ones that don't apply, e.g. drop Docs updates if no docs change), but keep this order and these headings:

```markdown
# Requirements: <feature title>

| Field | Value |
| --- | --- |
| **Backlog** | `<name>` · priority **<n>** · type **<feature|fix|...>** |
| **Status** | <Pending implementation | ...> |
| **Depends on** | <refs or —> |
| **Packages** | <package(s) touched; note which is primary and which stay unchanged> |

## Problem statement and motivation
<Why this exists. 1 short paragraph + a numbered list of concrete pain points.>

## Goals
<Numbered, outcome-focused. What "done" achieves.>

## Non-goals
<Bulleted. Explicitly out of scope to prevent drift.>

## User stories / use cases
<Numbered. "As <role> — <need>, so <outcome>." Cover the real actors from the conversation.>

## Proposed behavior and UX
<The contract surface the user/operator sees: CLI syntax, API signatures, schema/config shapes, data shapes, messages, JSON envelopes. Tables + minimal signature sketches only. No implementation code.>

## Technical approach
<Steps to build the feature, ordered. Affected packages/files as a table. State the contracts each step introduces or changes, not the code.>

## Testing strategy
<What test covers what part of the feature — not test implementation. Split by level (unit / integration / E2E) as tables. Call out existing tests that must be updated and why.>

## Docs updates
<Table: document → what changes. Omit if no docs are affected.>

## Acceptance criteria
<Checklist or numbered list. Each item independently verifiable and tied to a goal.>
```

Do **not** include an "Open questions" section. The requirements document must present a fully decided plan with no unresolved questions — resolve ambiguity with the user before writing (see "Before writing").

Optional trailing `## Reference:` sections (tables, mermaid diagrams) are fine when they clarify — keep them short.

## Section guidance

- **Metadata table** — mirror fields used by sibling requirements documents; keep only relevant rows. Always state which packages change vs stay unchanged.
- **Proposed behavior and UX** — this is where implementation contracts live. Show signatures like `acquireLock({ path, mode }) → Success<ReleaseFn> | Failure<string>`, schema/config JSON shapes, CLI usage blocks, and message/JSON-envelope examples. Never full functions.
- **Technical approach** — the ordered steps to implement the feature, mapped to files. Describe *what* each step changes (contract, path, behavior), not *how* in code.
- **Testing strategy** — for each part of the feature, name the test(s) that prove it and at which level. Explicitly flag tests that need updating (e.g. "`lumpHistoryFilePath/unit.test.ts` expected path changes to `.yaml`"). No assertions/setup code.
- **Acceptance criteria** — each criterion maps back to a goal and is checkable without reading source.



## After writing

- Verify the file is at a valid backlog item path: `backlogItems/todo/<name>/requirements.md`.
- Re-read for concision: remove duplicated prose, collapse repeated ideas into one canonical spot, ensure headings match the structure above.
- Confirm no full code snippets slipped in — contracts and signatures only.
