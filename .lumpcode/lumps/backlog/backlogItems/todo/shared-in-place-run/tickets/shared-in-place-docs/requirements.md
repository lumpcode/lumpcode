# Requirements: shared in-place docs

| Field | Value |
| --- | --- |
| **Backlog** | `shared-in-place-docs` · parent `shared-in-place-run` · priority **2** · type **docs** |
| **Status** | Pending implementation |
| **Depends on** | `in-place-workspace`, `shared-run-review`, `shared-mode-no-daemon`, `open-pr-lump-prefix` |
| **Packages** | `packages/apps/website`, `packages/apps/cli/DOCS/`, `articles/`, root `AGENTS.md`. No engine behavior in this ticket. |

Umbrella: [parent requirements](../../requirements.md). Implement only after the other tickets match this copy.

## Problem statement and motivation

Docs still describe a shared project copy, an untouched laptop checkout, and `lump/…` as the first-run PR. Shipped behavior is in-place rehearsal: this branch, dirty allowed, optional LUMP commit, no auto push, `start` dedicated-only.

## Goals

1. Every listed surface matches shipped shared `run` / dedicated worker.
2. Zero user-facing “project copy” or “never touches this checkout” for shared `run`.
3. Jobs, not mode names, on user surfaces. `shared` / `dedicated` only next to `local.json`.

## Non-goals

- Changing CLI or recipes behavior.
- Teaching rehearsal in the landing hero.
- Writing **production** on the landing page.
- Documenting `supervise` as an operator command.
- Claiming Lumpcode opens pull requests.

## User stories / use cases

1. As a new author — First PR tells me to `run` on this branch, verify, type `c` if I want LUMP markers, push myself, then try the worker.
2. As an operator — Worker page still describes dedicated `lump/…` campaign branches.

## Proposed behavior and UX

Diction: laptop `run` does not create `lump/…` and does not commit or push unless the author types `c` (commit only). Worker still cuts `lump/…`. Opening a PR remains opt-in `openPrPostTeardown` on `lump/` branches.

| Document | Change |
| --- | --- |
| Website First PR | Rehearse on this branch (dirty ok); `run`; verify; `c` to stamp LUMP markers; you push. Then worker. Drop copy / `lump/…` as the first-run PR. |
| Worker page | Laptop run was rehearsal; this clone is the campaign. Dedicated unchanged. |
| Landing | Hero unchanged. Do not teach rehearsal in the hero. Worker loop still “branch you open as a PR.” |
| `/docs/config/local`, `/docs/start/run`, `/docs/start/terms`, `/docs/author/write-a-lump`, `/docs/author/agents` | In-place shared; start dedicated-only; review prompt; dirty allowed; no auto push. |
| `docs-shared-installation-guide` (docs lump) | Must not contradict. Align or fold into this change. |
| CLI `DOCS/` `concepts.md`, `local-config.md`, `commands.md`, `project-config.md`, `get-started.md`, `advanced-config.md` | Shared project = execution workspace. `start` dedicated-only. `refreshCommand` dedicated tick only. Dirty allowed. Review `c`/`e`. |
| `articles/05-hands-on-dedicated-daemon` | Kill “checkout untouched” and “review `lump/…` before the daemon.” |
| `articles/07-setup-abstraction-campaign` | Same laptop line. |
| `articles/01-dedicated-lumpcode-worker` | Worker-only. No laptop copy. |
| `AGENTS.md` | Shared in-place; no auto commit/push; review only in `commands/run`; `getExecutionWorkspacePath` both modes = source; no shared `start`; no shared copy. |

## Technical approach

Edit the listed files only. Keep website layout constraints (hero, First PR path, worker URL). Do not add a third Get started URL.

## Docs updates

This ticket *is* the docs update. See the table above.

## Acceptance criteria

1. Listed pages match shipped behavior (in-place, dirty ok, `c`/`e`, no auto push, start dedicated-only).
2. Zero user-facing “project copy” / “never touches this checkout” for shared `run`.
3. Landing hero unchanged; no rehearsal lesson in the hero.
4. `AGENTS.md` records the workspace facts in the table.
5. `docs-shared-installation-guide` does not contradict this ticket.
