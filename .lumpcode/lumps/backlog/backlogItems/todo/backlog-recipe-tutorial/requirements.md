# Requirements: Backlog recipe tutorial (DOCS + article seed)

| Field | Value |
| --- | --- |
| **Backlog** | `backlog-recipe-tutorial` · priority **16** · type **docs** · workflow **directImpl** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `packages/apps/cli/DOCS/` (new page + findability links). Also: `articles/` (publishable seed), short links in `@lumpcode/recipes` README, CLI README docs table, website `content/docs/author/recipes.md`. Runtime packages unchanged (`@lumpcode/cli`, `@lumpcode/core`, `@lumpcode/recipes` code, cli-types, cli-utils). |

## Problem statement and motivation

Operators who already finished get-started can install `@lumpcode/recipes` and still lack a single **scaffold → minimal files → run** path for a folder backlog campaign. The recipes README and website `/docs/author/recipes` list factories and show a tiny `featureBacklog({…})` snippet, but they do not walk an operator through creating the lump, the first `desc.yml` / `requirements.md`, planning, and one successful `lumpcode run`. That gap also means there is no concise how-to body ready to seed an X thread and a dev.to post (unlike the dedicated-daemon and abstraction-campaign articles).

Concrete pain:

1. No CLI DOCS tutorial for the backlog recipe; get-started stops at a generic first lump.
2. Recipes README examples assume familiarity with `discoveryBranches`, `directImpl`, and the `dev` / `feature/*` matching rules.
3. Public how-to coverage for recipes jumps to the two-lump abstraction pipeline without a simpler single-lump backlog entry.
4. Expanding into a multi-recipe tutorial suite now would dilute the one path that unblocks most authors.

## Goals

1. **One tutorial page** in CLI DOCS that takes a reader from an existing Lumpcode project to a first backlog-recipe run (scaffold → minimal files → plan → run).
2. **Subject is `featureBacklog`** — the opinionated folder feature campaign (what the repo’s own `backlog` lump wraps). Name the page and headings so readers see both “backlog recipe” and the export `featureBacklog`.
3. **Self-contained how-to** — prerequisites, exact commands, minimal file shapes, and what success looks like (branch pushed with a LUMP marker; reader opens a PR). Depth links optional only.
4. **Reuse-ready narrative** — same page body (or a near-identical sibling under `articles/`) can seed an X thread and a dev.to article without inventing a second divergent tutorial.
5. **Findability** — get-started / examples / recipes README / CLI README / website recipes overview point at the new page; no second full copy of the tutorial on those surfaces.

## Non-goals

- Full multi-recipe tutorial suite (`backlog` stage-map authoring, `abstractionFinder` / `abstractionBacklog`, custom kit-only configs).
- Deep TDD stage walkthrough (`makeTestPlan` / `testImpl`), tickets under `todo/<parent>/tickets/`, or daemon/`lumpcode start` ops (one short “next” pointer is enough).
- Changing recipe APIs, CLI commands, schemas, or runtime behavior.
- Rewriting get-started, concepts, or the whole website author section.
- A full website rewrite of every CLI DOCS page; at most findability on `/docs/author/recipes` (optional thin website mirror only if it stays one page and does not fork the steps).
- Migration guides, historical notes, or documenting deprecated `ymlBacklogContexts` / `setTaskDoneStep`.

## User stories / use cases

1. **Lump author (post get-started)** — Wants a folder of feature items driven by `featureBacklog`, follows one page, and completes a first `lumpcode run` that pushes a reviewable branch.
2. **Operator evaluating recipes** — Skims the tutorial’s product intro and decides whether a backlog campaign fits before reading kit reference tables.
3. **Content / social** — Reuses the same step sequence for an X thread and a dev.to how-to without rewriting the procedure from scratch.
4. **Docs navigator** — Finds the tutorial from get-started “Next steps”, examples, `@lumpcode/recipes` README, CLI README, or website Recipes without hunting GitHub trees.

## Proposed behavior and UX

Docs and articles only. No new CLI flags or envelopes. Commands used in the tutorial are existing:

```text
npm install --save-dev @lumpcode/cli-utils @lumpcode/recipes
lumpcode lump-create <lumpName> --config ts
lumpcode lump-plan <lumpName> --contexts
lumpcode run <lumpName>
```

Optional in the tutorial when discovery is pattern-only or the checkout is not on the intended scan line: `--discoveryBranch <branch>` (document only if the minimal path needs it).

### Subject and naming

| Term in prose | Meaning |
| --- | --- |
| Backlog recipe (tutorial subject) | `@lumpcode/recipes` export **`featureBacklog`** |
| Generic `backlog` | Mention once as the lower-level stage-map factory; **out of tutorial steps** |
| Lump name in examples | Prefer a neutral name such as `myBacklog` (not this monorepo’s internal `backlog` lump) |

### Canonical tutorial home

| Surface | Role |
| --- | --- |
| `packages/apps/cli/DOCS/backlog-recipe.md` | **Canonical owner** of the scaffold → files → run tutorial |
| `articles/10-feature-backlog/` (or next free `NN-` slug) | Publishable seed: same steps, public how-to framing; `article.md` edit source; `article.html` for X paste; `publish.json` for target platform(s) |
| Other DOCS / README / website recipes | Findability links only |

No second full tutorial body on get-started, examples, or recipes overview pages.

### Tutorial path (contract)

The page must be a linear how-to. Required arc:

1. **Short product intro** (2–4 sentences): Lumpcode runs agent campaigns as reviewable git slices; this page sets up one **`featureBacklog`** campaign. Optional one-line mention of `/lumpcode` skill (`npx skills add lumpcode/skills`). Suitable to open a public article.
2. **Prerequisites** (assume get-started already done; link it):
   - Existing Lumpcode project (`.git` + `.lumpcode/`, `project-setup` done, agent on `PATH`).
   - Project `package.json` can resolve `@lumpcode/cli-utils` and `@lumpcode/recipes` (install in the day-to-day repo before a dedicated worker clone needs them).
   - **Discovery reality:** `featureBacklog` only schedules items when the concrete `discoveryBranch` is `dev` (top-level `directImpl` only) or `feature/<itemOrParentName>`. Tutorial must state that the minimal path uses a **`dev`** primary/discovery line (set `primaryBranch` / `primaryBranches` accordingly if the repo integrates on `dev`). Do not pretend `main`-only discovery works without matching recipe rules.
3. **Scaffold** — `lumpcode lump-create <lumpName> --config ts`.
4. **Replace config** — minimal `featureBacklog({…})` TypeScript config. Required fields in the shown example:

   | Field | Tutorial value |
   | --- | --- |
   | `configUrl` | `import.meta.url` (required) |
   | `command` | A shipped preset tag (e.g. `cursor`) |
   | `discoveryBranches` | `['dev', 'feature/*']` (or equivalent that includes `dev` for the first `directImpl` run) |
   | `implValidateCommand` | A simple project-realistic string the reader can edit (e.g. `npm test` or a one-line build); may note omitting it uses recipe defaults where applicable |

   Omit CLI-default noise (`numberOfContextsPerBranch: 1`, etc.). Optional one-liner for `openPrPostTeardown` as opt-in after push (CLI still stops at `git push` by default; do not claim Lumpcode opens PRs).
5. **Minimal backlog files** under `.lumpcode/lumps/<lumpName>/backlogItems/`:

   ```text
   todo/<itemName>/desc.yml
   todo/<itemName>/requirements.md
   ```

   **`desc.yml` contract** (single YAML object):

   | Field | Required | Tutorial value |
   | --- | --- | --- |
   | `name` | yes | Same as folder name; must not end with `_req`, `_testPlan`, or `_tests_impl` |
   | `task` | yes | One clear sentence the agent can act on |
   | `priority` | yes | Number (lower = sooner); e.g. `1` |
   | `workflow` | yes for minimal path | `directImpl` (so the item is eligible on `dev`) |
   | `dependsOn` | no | Omit in the minimal example |
   | `manualReq` | no | Omit (reader supplies `requirements.md` so the first run is not blocked waiting for a human file) |

   **`requirements.md`:** short hand-written requirements so `directImpl` does not first emit a `_req` context. State that if the file is missing and `manualReq` is not set, `featureBacklog` runs `makeReq` first.
6. **Plan** — `lumpcode lump-plan <lumpName> --contexts` and what the reader should see (at least the `directImpl` context name = item name).
7. **Run** — `lumpcode run <lumpName>` (document `--discoveryBranch` only if required for the stated local.json / branch setup). Success: agent runs, marker commit, branch on remote; reader opens a PR and merges. After merge on `dev`, resumable status moves the item forward / move-to-done semantics as implemented by the recipe (describe at outcome level, not internal step names beyond `directImpl` / `moveToDone`).
8. **Next (short)** — bullets only: default TDD workflow when `workflow` is omitted; `feature/<name>` branches for non-`directImpl` work; tickets; leave a worker running (`lumpcode start`) / link get-started or worker docs. Explicitly **do not** expand those into full tutorials here.

### Voice and reuse constraints

- Periods/commas preferred over em dashes (match CLI DOCS).
- Self-contained: a reader can follow without opening other pages except optional depth links.
- Define **lump** once; use **campaign** freely; **context** for isolation / planned units.
- Human review via **PR merge**.
- Do not write that Lumpcode or the daemon opens pull requests.
- For the `articles/` seed: how-to shape (product intro → numbered commands); mention published `/lumpcode` skill as optional help; X paste uses sibling `article.html`; X outro may use `x.com/ddyods` per existing articles. Positioning diction: plain/sharp; prefer **campaign**; skip “loop engineering” on X-oriented copy if the article targets X (keep the term only if the piece stays docs-adjacent). Cover image optional (5:2 if added).

### Illustrative minimal config shape (contract, not mandatory prose)

Implementers may rephrase; meaning must match:

```ts
import { featureBacklog } from '@lumpcode/recipes';

export default featureBacklog({
  configUrl: import.meta.url,
  command: 'cursor',
  discoveryBranches: ['dev', 'feature/*'],
  implValidateCommand: 'npm test',
});
```

```yaml
name: hello-docs
task: Add a one-line clarification to the project README.
priority: 1
workflow: directImpl
```

## Technical approach

| Step | Where | Contract / change |
| --- | --- | --- |
| 1 | `packages/apps/cli/DOCS/backlog-recipe.md` | New page: full tutorial arc above; canonical owner |
| 2 | Findability | Link from `get-started.md` Next steps, `examples.md` (near recipe / backlog-adjacent examples), `packages/apps/cli/README.md` docs table (absolute GitHub URL), `packages/recipes/README.md` (point at the tutorial for operators), `packages/apps/website/content/docs/author/recipes.md` (one “Tutorial” link to the GitHub DOCS page or site path if a thin mirror exists) |
| 3 | `articles/10-feature-backlog/` (adjust `NN` if taken) | Seed from the DOCS page: same step order and file contracts; public intro; `article.md` + `article.html` + `publish.json` (`platform`: `dev.to` and/or `x` as appropriate). Do not invent a different minimal path |
| 4 | Consistency pass | Commands, discovery/`dev` rule, `directImpl` + `requirements.md` behavior, and “CLI pushes / opt-in open PR” match real `featureBacklog` + CLI behavior |
| 5 | No runtime code | No changes under `packages/recipes/src`, CLI `src`, schemas, or `desc.yml` for this backlog item |

**Ownership:** tutorial procedure lives only in `DOCS/backlog-recipe.md`. The articles folder is a publish adaptation of that procedure, not a competing source of truth for steps. Other docs link; they must not paste the full step list.

## Docs updates

| Document | What changes |
| --- | --- |
| `packages/apps/cli/DOCS/backlog-recipe.md` | **New** — canonical tutorial |
| `packages/apps/cli/DOCS/get-started.md` | Next steps: one link |
| `packages/apps/cli/DOCS/examples.md` | One findability link (no second tutorial) |
| `packages/apps/cli/README.md` | Docs table row (absolute GitHub URL) |
| `packages/recipes/README.md` | Short pointer to the tutorial near Recipes / featureBacklog |
| `packages/apps/website/content/docs/author/recipes.md` | Findability link to the tutorial |
| `articles/10-feature-backlog/*` (or next `NN`) | Publishable seed (`article.md`, `article.html`, `publish.json`) |
| Runtime / schema / other DOCS | Unchanged |

## Acceptance criteria

1. `packages/apps/cli/DOCS/backlog-recipe.md` exists and is self-contained for scaffold → minimal files → `lump-plan` → `lumpcode run`.
2. Tutorial subject is **`featureBacklog`**; generic `backlog` is not used as the walked example.
3. Page documents the **`dev` / `feature/*` discovery matching rule** and uses a **`directImpl`** item plus hand-written **`requirements.md`** for the first successful implementation-shaped run on `dev`.
4. Shown `desc.yml` and `config.ts` contracts match the tables above (`configUrl`, command tag, discovery branches, `name` / `task` / `priority` / `workflow: directImpl`).
5. Success outcome is a pushed branch with a LUMP marker and human **PR merge**; copy does not claim Lumpcode opens PRs (opt-in `openPrPostTeardown` only if mentioned).
6. TDD, tickets, and worker/`start` appear only as short “next” pointers, not full tutorials.
7. Findability links exist from get-started, examples, CLI README, recipes README, and website recipes overview; none re-host the full tutorial.
8. `articles/NN-…` seed exists with the same step sequence and is structured for X + dev.to reuse (`article.md`; `article.html` when targeting X).
9. No runtime package, schema, or CLI behavior changes in this item’s diff.
)
