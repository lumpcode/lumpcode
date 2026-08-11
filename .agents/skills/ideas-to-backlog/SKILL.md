---
name: ideas-to-backlog
description: >-
  Batch-triage committed IDEAS.yaml into backlog todos (promote, reject, park,
  or spawn ideas) in an interactive session. Use when running the ideasToBacklog
  lump cloud agent, or when the user asks to triage IDEAS into the backlog.
---

# Ideas to backlog

Help me choose which entries in `IDEAS.yaml` to act on today, clarify them lightly, then apply file updates when I say we are done for today.

## Intake contract

`IDEAS.yaml` (repo root) is a YAML list of:

```ts
type IdeaEntry = {
  name: string;   // unique; may be ephemeral ("1", "A")
  task: string;
  blocked?: string; // non-empty ⇒ parked; do not promote until cleared
  priority?: number; // lower = more important; omit = normal / unordered
};
```

Ignore unknown keys if present. Non-empty `blocked` means parked — skip for promotion unless I explicitly unpark in this session (clear `blocked`).

## How to run it

1. Read `@IDEAS.yaml` and summarize unblocked vs blocked counts in one or two sentences. When listing candidates, surface any set `priority` values (lower = more important).
2. Propose a batch to work on: prefer lower `priority` numbers first, then related ideas or the first N if nothing stands out. Ask me to confirm or adjust.
3. Clarify with **“Is this what you meant?”** → Yes / No / Explain more precisely. Prefer verification over A/B/C menus.
4. Only on a real blocker: present the blocker, offer a very global A/B/C, and give a recommendation.
5. Do **not** grill for full interfaces. At most pin one or two load-bearing contracts if needed for a useful `desc.yml` / optional `requirements.md`.
6. When I say we are **done for today**, apply mutations and stop. Untouched unblocked ideas stay as-is.

## Outcomes (only when I say done for today)

| Action | `IDEAS.yaml` | Backlog |
| --- | --- | --- |
| **Promote** | Remove the idea entry | Create `.lumpcode/lumps/backlog/backlogItems/todo/<finalName>/desc.yml` with at least `name` and `task`. Carry over IDEA `priority` when set (same meaning: lower = sooner). Optional: `workflow`, `dependsOn`, `manualReq`, `requirements.md`. Final `name` may differ from the IDEAS id (prefer kebab-case). Omit `workflow` to keep default `tdd`. |
| **Reject** | Remove the idea entry | No backlog changes |
| **Park** | Keep entry; set `blocked` to a short explanation (preserve `priority` if set) | No backlog changes |
| **Spawn** | Append new `{ name, task }` (optional `priority`; kebab-case when clear, else ephemeral id; unique in file) | — |

Do not leave half-applied file edits. Commit the settled `IDEAS.yaml` and backlog changes on this branch.

## Unpark (manual, outside this skill’s default)

To refine a parked idea again later: clear `blocked` in `IDEAS.yaml` **and** delete the open `ideasToBacklog` lump branch if one is still open.

## Ground rules

- One batch session may mix promote / reject / park / spawn.
- Ask one focused question at a time when clarifying.
- Explore the codebase when a question can be answered that way.
- Do not implement product features in this session — only triage into backlog / IDEAS.
