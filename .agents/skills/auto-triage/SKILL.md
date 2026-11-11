---
name: auto-triage
description: >-
  Choose 1 to 5 backlog items from IDEAS.yaml and existing todos, and write
  desc.yml plus requirements.md with workflow impl. Use when the autoTriage
  lump runs. Decides without asking the operator.
disable-model-invocation: true
---

# Auto triage

Turn waiting ideas and idle todos into work the other lumps can implement on `dev`. You decide. You do not ask the operator.

## Sources

1. `IDEAS.yaml` at the repo root. Entries are `{ name, task, blocked?, priority?, tags? }`. A non-empty `blocked` string is parked: leave it. `priority` lower means more important. Ignore unknown keys.
2. Existing `desc.yml` todos under `.lumpcode/lumps/{backlog,docs,qol,bugfixes}/backlogItems/todo/`.

Read both before you choose. Skip a candidate that duplicates an open todo.

## What one run produces

1 to 5 items, total, across lanes. Prefer several small, interesting updates a reviewer can merge one at a time. When the best candidate is one large idea or one oversized todo, split that one candidate into 2–5 small items instead of promoting it whole.

Each slice:

- Leaves the tree buildable and the product coherent on its own, so it can merge to `dev` without waiting for a later slice to compile.
- Is a top-level folder `backlogItems/todo/<name>/`. Do not create `tickets/` children. Nested tickets wait on a `feature/<name>` discovery branch and will not run on the `dev` scan.
- Uses `dependsOn` only for other item names in the same lane, and only when a later slice needs the earlier slice's code already on `dev`.

## Lanes

| Lane | Folder | Put it here when |
| --- | --- | --- |
| `backlog` | `.lumpcode/lumps/backlog/` | Product behavior in core, CLI, or recipes |
| `qol` | `.lumpcode/lumps/qol/` | Small quality-of-life in the product |
| `bugfixes` | `.lumpcode/lumps/bugfixes/` | A known defect from an idea, with a repro in the requirements |
| `docs` | `.lumpcode/lumps/docs/` | Operator docs, naming, or website copy that is larger than a wording nit |

`backlog`, `qol`, and `bugfixes` are `featureBacklog` lumps. `docs` is implementation-only and reads `requirements.md` when that file exists.

After this run, no lane has more than 5 todo directories that contain `desc.yml`. If a lane is already at 5, do not add a folder there. You may still fill `requirements.md` on a desc-only item already in that lane.

## Files for every item

Folder name and `name` match. `name` matches `^[a-zA-Z0-9_-]+$` and does not end in `_req`, `_testPlan`, or `_testImpl`.

`desc.yml` for `backlog`, `qol`, and `bugfixes`:

```yaml
# yaml-language-server: $schema=https://lumpcode.com/schemas/featureBacklogDesc.schema.json
name: kebab-name
workflow:
  - impl
task: >-
  One sentence a reviewer can read without opening the requirements.
priority: 20
```

`docs` uses the same shape with schema `https://lumpcode.com/schemas/backlogDesc.schema.json` and the same `workflow: [impl]`.

`workflow` is exactly `[impl]`. That stage runs on the `dev` discovery branch once `requirements.md` exists. Omit `dependsOn` when nothing blocks the item. Copy `priority` from the idea when it is set. When you invent one, use 20 or higher so priority 0 items stay ahead. Later slices of a split get the previous slice's priority plus 1.

`requirements.md` uses the headings in `.agents/skills/write-requirements/SKILL.md`. Fill every heading that applies with a decision. Contracts, not code. No open-questions section. The file is the plan the implementing lump will follow, so name the owning module for any shared concern.

## Ideas file

When you promote an idea, delete that entry from `IDEAS.yaml`. When you split one idea, delete that one entry and keep every other entry. Leave parked and untouched ideas as they are. You may set `blocked` to one sentence when an idea cannot be specified from the code. Do that instead of inventing a ticket.

## Idle todos

You may replace one todo that has `desc.yml` and no `requirements.md` and no `testPlan.md` when its task is too big for one PR: delete that folder and add the slices in the same change. Leave any todo that already has `requirements.md`.

## Bounds

Product code, tests, docs pages, and website copy stay untouched. This run only edits `IDEAS.yaml` and the todo folders above.

When every candidate is parked, duplicated, or would push a lane past 5 todos, write `.lumpcode/lumps/autoTriage/skipped.md` with the reason in a few sentences and stop.
