# Requirements: Easy-to-use wording on READMEs

| Field | Value |
| --- | --- |
| **Backlog** | `add-easy-to-use-wording-on-readmes` · priority **14** · workflow **directImpl** |
| **Type** | docs |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Docs only: root `README.md`, `packages/apps/cli/README.md`, optional short touch on `packages/apps/cli/DOCS/get-started.md`. No runtime package code. `@lumpcode/core`, `cli-types`, `cli-utils`, `recipes` unchanged. |

## Problem statement and motivation

Root and CLI READMEs already call Lumpcode straightforward and configurable, but they do not state the **minimal operator bar** in one place: a machine with your repo, git access, and a configured CLI agent. Prospects can miss that Lumpcode is local-first and does not require a Lumpcode account, hosted runner, or separate control plane.

Pain points:

1. "Easy to adopt" appears without the concrete three-part bar (repo + git + agent).
2. Prerequisites live only under Quick start, so skimmers never see how little infra is needed.
3. Power/configurability and simplicity are not paired as one message on the CLI README open.

## Goals

1. **Minimal-bar message** — Root and CLI READMEs each state, near the top, that running Lumpcode needs a machine with your repo, git access, and a configured CLI agent.
2. **Straightforward + powerful** — Same surfaces keep the contrast: easy to start, still configurable and powerful (same idea as today's "easy to adopt / fully configurable," sharpened with the minimal bar).
3. **Truthful framing** — Wording stays aligned with real install/run facts (Node 22+, `npm install -g @lumpcode/cli`, `origin` push access, agent on `PATH`, LLM cost of agent runs). The minimal bar is about product surface, not a claim that Node/npm are unnecessary.
4. **Optional DOCS reinforce** — At most one short reinforcing sentence on the get-started intro or Prerequisites lead-in; no new DOCS landing page.

## Non-goals

- Rewriting Quick start, command reference, concepts, or lump-config docs.
- Changing install steps, CLI flags, schemas, or runtime behavior.
- Adding a `packages/apps/cli/DOCS/README.md` (or other new landing file).
- Keyword stuffing "loop engineering," new brand slogans, or SaaS comparisons beyond the minimal-bar claim.
- Editing publishable package READMEs other than `packages/apps/cli/README.md` (`@lumpcode/core`, recipes, cli-utils, etc.).
- Removing the early-development disclaimer or the lumpfish / LUMP backronym blocks.

## User stories / use cases

1. **Prospective operator (GitHub / npm README)** — Skims the first screen of the root or CLI README and understands Lumpcode runs on their machine against their repo with git and a CLI agent they already use; no Lumpcode cloud account required.
2. **New contributor evaluating adoption cost** — Sees that start is straightforward while advanced config (hooks, daemons, recipes) remains available as they grow.
3. **Doc reader starting the tutorial** — Optionally sees the same minimal bar once in get-started before the detailed Prerequisites list, then follows existing install/setup steps unchanged.

## Proposed behavior and UX

Docs-only. No CLI syntax, APIs, or runtime messages change.

### Required message (semantic contract)

Each **required** surface must convey all of the following (exact phrasing may vary; meaning must not):

| Claim | Must convey |
| --- | --- |
| Minimal bar | Needs a machine with **your repo**, **git access**, and a **configured CLI agent** |
| Easy start | Straightforward / easy to start (or adopt) |
| Power retained | Still configurable and powerful (or equivalent: full agent-loop / lump config depth remains) |
| Local-first | Implicit or explicit: no Lumpcode account / hosted control plane required to run |

### Placement

| Surface | Placement | Required? |
| --- | --- | --- |
| [README.md](../../../../../../README.md) | Opening pitch (first 1–2 paragraphs) and/or a short callout immediately after it, before Install | **Required** |
| [packages/apps/cli/README.md](../../../../../../packages/apps/cli/README.md) | Opening pitch (before or with "New here?"), before Install | **Required** |
| [packages/apps/cli/DOCS/get-started.md](../../../../../../packages/apps/cli/DOCS/get-started.md) | One sentence in the intro or at the start of Prerequisites | Optional |

### Style constraints (match existing docs rules)

- Periods/commas preferred over em dashes.
- Keep existing vocabulary: **lump** = agent loop campaign; human review via **PR merge**; do not add a second **loop engineering** mention on a surface that already has one.
- Keep early-development disclaimer and lumpfish image placement on the root README.
- Root README may keep relative `DOCS/` links; CLI README keeps absolute GitHub URLs for npm.
- Do not contradict Quick start Prerequisites (git `origin` push access, agent on `PATH`, LLM cost). The new wording may summarize; detail stays in get-started.

### Illustrative tone (not mandatory copy)

Acceptable shape (implementers may rewrite as long as the semantic contract holds):

> Lumpcode runs on a machine with your repo, git access, and a configured CLI agent. Straightforward to start; still configurable and powerful when you need hooks, daemons, or custom steps.

## Technical approach

1. **Root README** — Edit the opening pitch so the minimal bar and easy-start / still-powerful contrast are visible above Install. Prefer tightening the existing "straightforward and easy to adopt, yet fully configurable" line rather than adding a long new section.
2. **CLI README** — Mirror the same semantic contract in the opening paragraphs so npmjs.com visitors see it without opening the monorepo root README.
3. **Optional get-started** — If used, add at most one reinforcing sentence; leave the numbered Prerequisites list as the source of truth for Node, git/`origin`, and agent resolution.
4. **Consistency pass** — Ensure root and CLI do not contradict each other on the minimal bar; do not invent infra requirements (accounts, special hosts) or drop real ones (Node 22+, `origin`).
5. **No code / schema / package.json changes.**

### Affected files

| File | Change |
| --- | --- |
| `README.md` | Required wording update |
| `packages/apps/cli/README.md` | Required wording update |
| `packages/apps/cli/DOCS/get-started.md` | Optional one-sentence reinforce |

Canonical owner of this message: the two README openings. get-started must not become a second full pitch; other DOCS pages must not re-copy a long variant.

## Docs updates

| Document | What changes |
| --- | --- |
| Root `README.md` | Opening: minimal bar + easy start + still powerful |
| `packages/apps/cli/README.md` | Same semantic contract for npm/GitHub CLI readers |
| `packages/apps/cli/DOCS/get-started.md` | Optional one-sentence reinforce; Prerequisites detail unchanged |
| Other `DOCS/*`, package READMEs, schemas | Unchanged |

## Acceptance criteria

1. Root `README.md` states the minimal bar (repo + git access + configured CLI agent) above the Install section.
2. `packages/apps/cli/README.md` states the same minimal bar above its Install section.
3. Both READMEs still communicate that Lumpcode is straightforward to start and remains configurable/powerful.
4. Neither README claims a Lumpcode cloud account or hosted control plane is required to run.
5. Neither README contradicts existing Prerequisites (Node 22+, `origin` push, agent on `PATH`, LLM cost awareness).
6. Early-development disclaimer, lumpfish block (root), and existing single **loop engineering** mention per surface remain intact.
7. If get-started is touched, the change is one short reinforcing sentence only; the Prerequisites numbered list remains the detailed source of truth.
8. No runtime code, schemas, or non-CLI package READMEs changed for this item.
)
