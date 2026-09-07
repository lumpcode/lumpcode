---
name: write-tickets
description: Break a plan, spec, or the current conversation into a set of tracer-bullet Lumpcode backlog items (tickets), each declaring its blocking edges, and publish them as `desc.yml` files under the right lump's `backlogItems/todo/` tree.
---

# Write tickets

Break a plan, spec, or conversation into a set of **tickets**: tracer-bullet vertical slices that fit inside one Lumpcode backlog item each. Each ticket declares the tickets that **block** it, and lands as one `backlogItems/todo/<kebab-name>/desc.yml` file (plus a `requirements.md` when the ticket needs a detailed spec).

## When to use this skill

- The work is too big for a single `requirements.md`.
- There are clearly separable vertical slices or gated hand-offs.
- You want the Lump daemon (`featureBacklog`, `backlog`, etc.) to pick up the items automatically.

If the work is a single, fully-decided feature, use `write-requirements` instead.

## Process

### 1. Gather context

Work from whatever is already in the conversation. If the user passes a reference (a spec path, an issue number, a URL, or an existing `requirements.md`), fetch it and read its full body.

### 2. Decide the target lump

Tickets live inside one lump at a time.

- Infer `<lumpName>` from context if possible (the current lump being discussed, the active branch name, or an existing backlog path).
- If the target lump is ambiguous, ask the user once.
- If the user does not specify a lump and there is no clear default, land the tickets in the lump that is most closely related to the work, or ask.

Each ticket becomes a directory:

```text
.lumpcode/lumps/<lumpName>/backlogItems/todo/<kebab-name>/
  desc.yml
  requirements.md   # optional; use write-requirements for complex tickets
```

### 3. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state. Ticket titles and descriptions should use the project's domain glossary and respect ADRs in the area you are touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 4. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests): vertical, NOT a horizontal slice of one layer.
- A completed slice is demoable or verifiable on its own.
- Each slice is sized to fit in a single fresh context window.
- Any prefactoring should be done first.

</vertical-slice-rules>

Give each ticket its **blocking edges**: the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Do not force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches cannot stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket; green is promised only there.

### 5. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work
- **Needs requirements.md?** yes/no — say yes when the ticket has non-trivial contracts, public API surface, or precise failure modes

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct: does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

### 6. Publish the tickets

Write the approved tickets to the lump's `backlogItems/todo/` tree.

- One directory per ticket.
- Each directory contains a `desc.yml` file.
- For any ticket flagged as needing detailed requirements, call `write-requirements` to produce `requirements.md` in the same directory.
- Also create or update the **general `requirements.md`** for the whole feature (see below): global shape, important decisions, interfaces, and a quick map of the tickets.

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

Do NOT close or modify any parent issue or existing requirements document.

## General requirements.md for ticketed features

When a feature is split into multiple tickets, still produce one **general requirements document** that captures the big picture. This is the file future readers open first.

### Where to put it

Default: `.lumpcode/lumps/<lumpName>/requirements.md`

If the lump already contains unrelated work, scope it to the feature: `.lumpcode/lumps/<lumpName>/<feature-slug>-requirements.md` or `.lumpcode/lumps/<lumpName>/<feature-slug>/requirements.md`.

### What it contains

Keep it short. This is the global shape, not the implementation of every ticket:

- **Problem statement and motivation** — why the whole feature exists.
- **Global goals and non-goals** — what the set of tickets achieves together, and what is out of scope.
- **Key decisions and interfaces** — architecture, public API/CLI surface, shared types, schemas, contracts that multiple tickets must honor. Name canonical owners for cross-cutting concerns.
- **Ticket map** — a table or list of the tickets, their priority/sequence, and what each one delivers. Reference the `desc.yml` names.
- **Acceptance criteria for the whole feature** — how to know the campaign is done.

Do not duplicate full ticket specs here. Point readers to the individual `backlogItems/todo/<ticket-name>/requirements.md` files when a ticket needs its own detailed contract.

### Example ticket map section

```markdown
## Tickets

| Order | Ticket | Delivers | Requirements |
| --- | --- | --- | --- |
| 1 | `add-rate-limit` | Core rate-limit helper + tests | `backlogItems/todo/add-rate-limit/requirements.md` |
| 2 | `wire-rate-limit-to-api` | Apply helper to all public endpoints | `backlogItems/todo/wire-rate-limit-to-api/desc.yml` |
| 3 | `migrate-existing-callers` | Update legacy callers to new helper | `backlogItems/todo/migrate-existing-callers/desc.yml` |
```

## Ticket format

### Directory name

Use kebab-case and keep it stable — it becomes the item `name` in `desc.yml` and the context name the lump will run.

```text
.lumpcode/lumps/<lumpName>/backlogItems/todo/<kebab-name>/
```

Rules:

- Lowercase letters, digits, hyphens, underscores only.
- Must not end in `_req`, `_testPlan`, or `_testImpl` (those suffixes are reserved for `featureBacklog` stage contexts).
- Keep it short but unambiguous.

### desc.yml

```yaml
# yaml-language-server: $schema=https://lumpcode.com/schemas/featureBacklogDesc.schema.json
name: <kebab-name>
workflow: [req, testPlan, testImpl, impl]
task: >-
  One or two sentences describing what this ticket makes work,
  from the user's or operator's perspective.
priority: 0
dependsOn:
  - <another-item-name-in-this-lump>
manual: false
```

Field guidance:

| Field | Required | Description |
| --- | --- | --- |
| `name` | yes | Same as the directory name. |
| `task` | yes | End-to-end outcome, not a layer-by-layer implementation list. |
| `priority` | yes | Lower number = sooner. Start the first ticket at `0`, then `1`, `2`, … |
| `workflow` | no | Array of stages. Defaults to `[req, testPlan, testImpl, impl]` for `featureBacklog`. Use `manualReq` for a human-gated requirements step, `directImpl` to skip requirements, `impl` only for pure implementation. Omit if the lump uses the generic `backlog` recipe (it ignores `workflow`). |
| `dependsOn` | no | Array of item names this ticket is blocked by. Same-lump items use bare names. Cross-lump dependencies use `<otherLumpName>/<contextName>`. |
| `manual` | no | Set `true` if this ticket should not spawn implementation sub-contexts after its umbrella `completion` stage (umbrella parents only). |

### Dependency format

- **Same lump**: list the bare `name` of the blocking item.

  ```yaml
  dependsOn:
    - auth-service
    - user-store
  ```

- **Cross-lump**: use `lumpName/contextName` for dependencies managed by another lump.

  ```yaml
  dependsOn:
    - api/auth-service
    - infra/user-store
  ```

The `featureBacklog` recipe will prefix same-lump names automatically when it builds context names. Do not invent cross-lump refs unless the user has confirmed the other lump exists and owns the dependency.

### requirements.md

Create `requirements.md` in the same directory for any ticket that has:

- a public API or CLI surface,
- non-trivial failure modes or error codes,
- cross-cutting ownership concerns,
- more than one reasonable implementation approach.

Use the `write-requirements` skill to generate it. Keep `desc.yml` short; put the detailed contracts in `requirements.md`.

### Example ticket tree

```text
.lumpcode/lumps/qol/backlogItems/todo/
  add-rate-limit/
    desc.yml
    requirements.md
  wire-rate-limit-to-api/
    desc.yml
  migrate-existing-callers/
    desc.yml
```

`wire-rate-limit-to-api/desc.yml`:

```yaml
# yaml-language-server: $schema=https://lumpcode.com/schemas/featureBacklogDesc.schema.json
name: wire-rate-limit-to-api
workflow: [req, testImpl, impl]
task: >-
  Apply the new rate-limit helper to every public API endpoint so requests
  above the configured threshold return 429 with a Retry-After header.
priority: 1
dependsOn:
  - add-rate-limit
```

## After writing

- Verify every `desc.yml` has a valid `name` matching its directory.
- Verify `dependsOn` references point to real sibling directories or confirmed cross-lump contexts.
- Re-read for concision: the `task` field should be one or two sentences.
- Confirm `priority` values are ordered so the frontier is clear.
