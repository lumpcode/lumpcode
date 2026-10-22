---
name: update-memory
description: Mines learnings.md from completed backlog items and their tickets, plus the Learned sections of the root AGENTS.md, checks each claim against the code, and updates .agents/memory and .agents/skills. Use when the user asks to update memory, harvest learnings, slim down AGENTS.md, or sync skills after tickets complete.
---

# Update memory

Two sources feed `.agents/memory`: `learnings.md` files on completed backlog items, and the `## Learned User Preferences` / `## Learned Workspace Facts` sections that continual learning appends to the root `AGENTS.md`. Turn both into general rules in the right memory file, or into a skill when the learning is a repeatable workflow.

## 1. Completed items

Read `.dyod.json` at the repo root.

- `parentTicketsFolders` lists the directories that contain backlog items (here `.lumpcode/lumps/**/backlogItems/`). Resolve each glob from the repo root.
- `ticketsFolderName` is the directory of child tickets inside a parent (here `tickets`).

A parent item is a directory directly under `backlogItems/completed/`. It is ready when its `desc.yml` has a non-empty `completedAt` and no `learntFrom: true`. Ignore `todo/`.

For each ready parent, read `learnings.md` on the parent and on every child under `<parent>/<ticketsFolderName>/`. Skip a missing `learnings.md`. A parent with no learnings anywhere is still marked treated.

The expectation is the item's `desc.yml` (`task`), `requirements.md`, `testPlan.md`, and `expect.yml`, on the item or its parent. The landing is what `learnings.md` describes. When a learning names a file or a rule, open that file. If the code contradicts the learning, record what the code does and say so in the report. Never write a contradicted claim into memory.

After treating a parent, set `learntFrom: true` in its `desc.yml`. Do not set it on a child.

## 2. Root AGENTS.md Learned sections

Read the bullets under `## Learned User Preferences` and `## Learned Workspace Facts` in the root `AGENTS.md`. For each bullet that is durable and true in the code, move it into the matching memory file, then delete the bullet from the root. Delete bullets that are wrong, one-off, or already in memory. Keep the two headings and their one-line note. Do not edit the rest of the root `AGENTS.md` unless a learning makes a line there false; then fix that line.

## 3. Write memory

Generalize. From the learnings, the gap, and the adjustments, state the rule that would apply the next time similar work shows up. Leave the ticket name, the one-off fix, and the session detail out.

Read `.agents/memory/AGENTS.md`. It lists the folders (`ontology/`, `domain/`, `code-conventions/`, `writing/`) and what each holds; each folder's `AGENTS.md` lists its files. Put the rule in the matching file and update it in place. Add a file only when no existing file owns the topic, and add it to that folder's index. Add a folder only when none fits, and list it in `.agents/memory/AGENTS.md`. Link to the type, schema, or module; do not paste them. No secrets.

A new or changed entity, or a changed relation between entities, goes in `ontology/`. Behavior goes in `domain/`. How code, tests, and releases are written goes in `code-conventions/`. Docs, website, and positioning rules go in `writing/`.

## 4. Update skills

A product fact belongs in memory, not in a skill.

- When a learning changes a workflow an existing skill in `.agents/skills/` owns, edit that skill.
- When a learning is a new repeatable workflow the agent would not already know, add `.agents/skills/<name>/SKILL.md` with `name` and a third-person `description` that says what the skill does and when to use it. Match the other skills' shape. Public skills are listed in `scripts/public-skills.mjs`; leave new skills internal unless the user asks.
- Do not add a skill for a single fact, a preference, or a one-time fix.

## Report

List the parents treated, the child learnings read, the root bullets moved or dropped, the memory files changed, and any skill created or edited. Name any learning the code contradicted. When nothing durable remains, say that no memory or skill updates were made.
