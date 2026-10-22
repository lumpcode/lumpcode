---
name: capture-learnings
description: Writes a backlog item's learnings.md from the commit that landed, the expectation (desc.yml, requirements.md, testPlan.md, expect.yml), and the adjustments made precise in the session. Use when the user asks to capture learnings, write learnings.md, or record how a ticket landed against its expectation.
---

# Capture learnings

Write `learnings.md` on the backlog item or ticket. It records what was expected, what the commit landed, where those differ, and what this session discussed and made precise as adjustments. `update-memory` later turns these files into durable memory, so the facts here must be checkable.

## Which item

Read `.dyod.json` at the repo root.

- `parentTicketsFolders` lists the directories that contain backlog items (here `.lumpcode/lumps/**/backlogItems/`). Resolve each glob from the repo root.
- `ticketsFolderName` is the directory that holds child tickets inside a parent item (here `tickets`).

Use the item this session implemented. If the user names one, use that. If more than one item could match, ask once. Items live in `todo/` while in flight and in `completed/` after the recipe moved them; check both.

Write `learnings.md` in that item's directory. If the file already exists, update it in place and keep what earlier stages recorded.

## Expectation

Read, when they exist, in the item directory or else on the parent item:

- `desc.yml`: `task`, `workflow`, `dependsOn`
- `requirements.md`: the decided plan
- `testPlan.md`: the tests that define done
- `expect.yml`: the scope contract (`files`, per-file `desc`, `"-"` / `"+"` estimates, `symbols`).

## What landed

Read the commit for this work. Use the commit the user names. Otherwise use the latest commit on the branch that carries this item's `LUMP: <lumpName> - <contextName>` marker, or the working tree when the marker commit does not exist yet. Inspect that diff only; do not pull in unrelated commits.

When a file in `expect.yml` is missing from the diff, say so. When the diff touches files the expectation does not mention, say so. Compare line counts against the `"-"` / `"+"` estimates when they exist.

## Session

From this session, keep what was discussed and made precise as an adjustment: a correction, a scope change, or a decision that changed the expectation or the implementation. Leave out the rest of the chat.

## learnings.md

```markdown
# Learnings

## Expected
What desc.yml, requirements.md, testPlan.md, and expect.yml asked for.

## Landed
What the commit actually changed. Name the files.

## Gap
Where the landing differs from the expectation. Omit this section when they match.

## Adjustments
What the session discussed and made precise. Omit this section when the session added nothing.
```

Keep each section short. No secrets. No play-by-play of the chat. Do not invent a commit hash.
