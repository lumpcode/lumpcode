# Requirements: Recipe catalog (umbrella)

| Field | Value |
| --- | --- |
| **Backlog** | `recipe-catalog` · priority **25** · umbrella · after 0.11.0 |
| **Depends on** | `factory-templates-lump-create-from-recipe` |
| **Roadmap** | `.lumpcode/lumps/backlog/last-20-percent-requirements.md` |
| **Packages** | `@lumpcode/recipes` (primary), `packages/apps/cli/DOCS/examples/`, this repo's lumps that move onto a recipe |

## Problem statement and motivation

The docs show many lump patterns (`DOCS/examples/`), but every one of them is copy-and-edit, and the four recipes that exist are all backlogs. A newcomer should be able to pick a ready-made factory for a common job, see it running, then read and change the TypeScript it produced.

## Goals

1. Five recipes: `sweep`, `improver`, `duplicationFinder` / `duplicationRemover`, `missingTests`, `issueQueue`.
2. Each one is `lump-create --recipe` away and works through the project template.

## Non-goals

- Any recipe that needs a Lumpcode backend.
- Host integration in the CLI. `issueQueue` calls `gh`, `glab` or `az` itself.
- Removing the old `abstractionFinder` / `abstractionBacklog` exports in this umbrella (deprecated aliases stay).

## Key decisions

- **Every ticket ships the full slice:** the recipe, its registry entry, one docs example in `DOCS/examples/`, and an E2E smoke on a fixture repo under `os.tmpdir()`.
- Recipes are workflow recipes (`workflow-api` contract): each returns a config with `workflow`, built on the workflow kit (`retryUntilGreen`, `requireArtifact`, `mustSucceed`) and the context helpers (`ephemeralContextListFn`, `folderBacklogContexts`), and never duplicates them. No `…Steps` version is added for new recipes.
- A recipe never opens a PR by itself; that stays in the template.

## Tickets

| Order | Ticket | Delivers |
| --- | --- | --- |
| 25 | `sweep-recipe` | Matched files to contexts, one prompt, optional check, grouping, shrinking list |
| 26 | `improver-recipe` | One small change per run with an explanation; polisher, writer, trimmer move onto it |
| 27 | `duplication-recipes` | `duplicationFinder` / `duplicationRemover`, not CLI-specific, old names deprecated |
| 28 | `missing-tests-recipe` | Built on sweep: a test for each file without one |
| 29 | `issue-queue-recipe` | Labeled issues from GitHub, GitLab or Azure DevOps as contexts |

## Acceptance criteria

- `lumpcode lump-create <name> --recipe <recipe>` works for all five and passes `lump-plan`.
- Each recipe's E2E smoke pushes at least one branch on a fixture remote.
