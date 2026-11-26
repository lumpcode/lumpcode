# Requirements: the last 20%

| Field | Value |
| --- | --- |
| **Scope** | Cross-lump roadmap: `backlog`, `qol`, `bugfixes`, `docs`. Until 0.11.0 the daemon (`.lumpcode/daemons/main.json`) runs only `qol`, `backlog` and `bugfixes`, so everything up to the release lives in those three lumps. |
| **Umbrellas** | `workflow-api`, `factory-templates`, `recipe-catalog`, `dashboard-v2`, `worker-deploy` (backlog lump) |
| **Decided** | 2026-11-23, templates and distribution grilled 2026-11-24, workflow API grilled 2026-11-26 |

## Problem statement and motivation

Lumpcode works, but a newcomer has a hard time seeing what to build with it, deploying a worker takes a manual setup, and watching a worker means a terminal on that machine. Narrower tools in the same space are easier to read because they are opinionated: ready-made templates, a board, a short film. Lumpcode stays versatile (a lump is code, Lumpcode only fixes the shape), but it needs the same clarity, and it must inspire confidence and quality.

The message to carry everywhere: **everything you can code with your agent can become a factory.**

## Goals

1. A lump's work reads as one plain function (`workflow`): Lumpcode is a library first, a CLI second.
2. A newcomer starts from a recipe in one command and sees the result as plain TypeScript they own.
3. A team keeps its needs (agent, model, workspace setup, open a PR after push) in templates (`.lumpcode/templates/<name>.ts` exporting `defineLump`) that its lumps use.
4. A worker is deployed on the operator's own cloud from a "Deploy a worker" page, with no Lumpcode backend.
5. The worker dashboard shows what a worker does (live state, transcripts, a per-lump board read from git) and can be exposed behind a shared password.
6. A new intro video shows all of the above, last.
7. No known bug in the core loop while this ships.

## Non-goals

- A hosted or paid Lumpcode cloud (IDEAS `hosted-workers`, blocked).
- Opening pull requests from the CLI. Opening a PR stays the `openPrPostTeardown` recipe kit helper, wired once in the project template. The CLI is not linked to GitHub, GitLab, Bitbucket or Azure DevOps.
- User accounts or per-person login on the dashboard.
- New JSON or YAML config features (`config-fn-as-script`, `yaml-lump-configs` are parked).
- Native binaries. npm is the only distribution (IDEAS `stable-native-binaries`, blocked).

## Key decisions

| Decision | Owner |
| --- | --- |
| A lump can declare `workflow`, one async function that is the context's single step, with `agent` (sessions on any command), `shell`, and a result (`succeeded`, `push`, `message`, `variables`). Steps stay as the second, declarative API. Recipes and kit are workflow first with the plain names; steps versions get a `Steps` suffix (breaking). `desc.yml` `stages` replaces `workflow`. | `workflow-api` (contract in its `requirements.md`), `workflow-first-docs-and-website` |
| This repo uses its own template first, written by hand from the install prompt, then its lumps become workflows. | `repo-templates`, `repo-lumps-workflow` |
| 0.11.0 is the breaking release that ships the workflow API; nothing after it starts before it lands. | `release-0-11-0` |
| TypeScript is the documented way to write a lump. JSON keeps working and is labeled experimental; the website and docs show only TypeScript, except one "Experimental: JSON configs" section. | `factory-templates`, docs `ts-first-docs-and-landing` |
| npm only: the SEA binaries are removed. | `factory-templates-drop-sea-binaries` |
| The CLI depends on `@lumpcode/recipes` and `@lumpcode/cli-utils`; imports of `@lumpcode/{recipes,cli-utils,cli-types,core}` use the project's install when present, else the CLI's copy, shown by `lump-plan`. Editor types come from `.lumpcode/tsconfig.json` and a generated `.lumpcode/.types/`. A TypeScript lump needs no `package.json` or root `tsconfig.json`. Verified 2026-11-23 on CLI 0.10.1: relative, `node:` and type-only imports already run without them; a value import of `@lumpcode/recipes` fails with `ERR_MODULE_NOT_FOUND`. | `factory-templates-cli-bundled-authoring-packages` |
| Templates are a convention, not a library feature: `.lumpcode/templates/<name>.ts` exports a plain `defineLump(config)`, several per repo allowed, merging decided by plain JavaScript. `setup` writes `main` like the install prompt; `lump-create --template` relies on it. | `factory-templates-ts-default-scaffolding` |
| Recipes are CLI generators through `lump-create --recipe`; each recipe registers its name, description and starter files in `@lumpcode/recipes`. | `factory-templates-lump-create-from-recipe` |
| Dashboard auth is one shared password. A non-loopback bind without it refuses to start; with it, controls work after login. | `dashboard-v2-dashboard-password-login` |
| Deploying is static: templates in the repo plus a page that builds the cloud-init or one-click link in the browser. Nothing is sent to a Lumpcode server. | `worker-deploy`, docs `deploy-worker-page` |

## Order

Lower priority runs sooner. The push has two phases: everything up to the **0.11.0 release** (breaking), then the rest, which depends on `release-0-11-0` and will be re-grilled and revalidated after the release. `dependsOn` holds the real gates.

| Wave | Priority | Work |
| --- | --- | --- |
| 0 | 0–9 | bugfixes (all three), qol command returns and `recipes-manual-req-default`, `history-and-transcripts`, `desc-name-folder-mismatch-warn` |
| 1 | 10 | `repo-templates`: this repo's lumps use `.lumpcode/templates/main.ts` |
| 2 | 11–15 | `workflow-api` (core, agent sessions, config and plan, kit, recipes) |
| 3 | 16–17 | `repo-lumps-workflow` (every repo lump as a workflow); `workflow-first-docs-and-website` (backlog lump) |
| 4 | 18 | `release-0-11-0`: versions, migration page; a human merges `dev` → `main` and tags `v0.11.0` |
| after 0.11.0 | 20–24 | `factory-templates` (drop SEA, bundled packages, TS scaffolding with workflow stubs and templates, `lump-create --recipe`, PR providers) |
| after 0.11.0 | 25–31 | `recipe-catalog` on workflow; docs `ts-first-docs-and-landing`, `landing-recipe-gallery` |
| after 0.11.0 | 30–36 | `dashboard-v2` (controls, password login, transcripts, lump board, run time, supervisor); qol `dashboard-match-website-look` |
| after 0.11.0 | 40–45 | `worker-deploy` (non-interactive setup, image, cloud templates), `git-access-heartbeat`; docs `worker-connections-docs`, `deploy-worker-page` |
| after 0.11.0 | 50–51 | docs `trust-page`, `intro-video-v2` |
| after 0.11.0 | 40–50 | lock follow-ups from PR #431: `drop-legacy-lock-json` (manual; allowed from 0.11.0 since 0.10.2 ships the fix, kept after it to keep 0.11.0 safe next to v0.10.x processes), `locks-command`, `in-process-lock-queue` |
| after 0.11.0, later | 60+ | `reuse-existing-lump-branch`, `project-local-config-field-layers`, `daemon-live-meta-subscribe`, `windows-step-job-object`, `daemon-orchestration`, `config-fn-as-script` (`external-agent-harness-library-presets` is a blocked idea since PR #430) |

## Acceptance criteria for the whole push

- In a repo with no Node files, `npm i -g @lumpcode/cli`, `lumpcode setup`, then `lumpcode lump-create <name> --recipe sweep` gives a lump that passes `lump-plan` and runs.
- Every public example is a `workflow`; steps appear only in "Advanced: steps".
- Every recipe has a docs example, a landing tile and an E2E smoke.
- A worker deployed from the website on each listed cloud pushes its first branch, and its dashboard is reachable behind the password.
- The landing, docs, `llms.txt` and video say the same thing, in TypeScript only.
