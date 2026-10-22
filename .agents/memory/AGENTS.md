# Lumpcode memory

Durable notes for agents working in this repo. The root `AGENTS.md` is the working guide; this folder holds the facts it points at. Each subfolder has its own `AGENTS.md` index. Open that index, then the files that match the work.

| Folder | Holds |
| --- | --- |
| `ontology/` | What each entity is (project, lump, context, status, steps, workspaces, branches, worker and daemon, command, recipe, backlog item) and how they relate. Index: `ontology/AGENTS.md` |
| `domain/` | How the product behaves: engine lifecycle, context sourcing, branches, workspaces, locks, daemon, commands and presets, recipes, distribution, this repo's lumps. Index: `domain/AGENTS.md` |
| `code-conventions/` | How code is written, tested, built, and released; CLI layout; skills and tickets. Index: `code-conventions/AGENTS.md` |
| `writing/` | Docs, website, README, and article rules: vocabulary, positioning, what never to claim. Index: `writing/AGENTS.md` |

## How to write

- One topic per file. Update the matching file instead of adding a near-duplicate.
- State the general rule, not the story of the ticket that taught it.
- Prefer a path into the codebase over a copied definition. Link types and schemas; do not paste them.
- Leave out secrets, one-off tasks, and anything that only restates the root guide.
- A repeatable workflow belongs in `.agents/skills/`, not here.
- Add a folder only when no existing one fits, and list it in this table.
