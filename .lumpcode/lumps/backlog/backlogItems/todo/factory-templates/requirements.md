# Requirements: Factory templates (umbrella)

| Field | Value |
| --- | --- |
| **Backlog** | `factory-templates` · priority **20** · umbrella · after 0.11.0 · depends on `release-0-11-0` and `workflow-api-config-and-plan` |
| **Roadmap** | `.lumpcode/lumps/backlog/last-20-percent-requirements.md` |
| **Packages** | `@lumpcode/cli` (distribution, TypeScript loader, `setup`, `lump-create`), `@lumpcode/recipes` (recipe registry, PR providers), `.github/workflows/build-cli.yml`. `@lumpcode/core` unchanged. |

## Problem statement and motivation

The way to use Lumpcode is a template holding the team's needs (agent, model, workspace setup, open a PR after push), then lumps that wrap a recipe or their own config in it. Today:

1. A TypeScript lump that imports `@lumpcode/recipes` fails unless the project ran `npm install`, which blocks repos that are not JavaScript and every fresh worker.
2. `setup` and `lump-create` default to JSON and write no template, while the install prompt writes `.lumpcode/templates/main.ts`.
3. Recipes are npm imports with no generator.
4. `openPrPostTeardown` supports GitHub only.
5. The CLI is built twice (npm bundle and SEA binaries), and the binaries reach no user.

## Goals

1. npm is the only distribution, with one Node runtime.
2. The global CLI alone runs and type-checks any TypeScript lump that imports `@lumpcode/*`.
3. `setup` and `lump-create` produce TypeScript (or JavaScript) and templates by default, after confirming the detected format, with `workflow` stubs.
4. `lump-create --recipe` turns a recipe into a working lump inside a template.
5. Opening a PR works on GitHub, GitLab, Azure DevOps and Bitbucket.

## Non-goals

- A template library helper (`defineTemplate`). Templates are plain JavaScript.
- Removing JSON support.
- Opening PRs from the CLI itself.
- Native binaries (IDEAS `stable-native-binaries`, blocked).

## Key decisions and interfaces

- **Distribution:** npm only. The SEA binaries, their download, launcher branch and `isSea()` paths are removed.
- **Authoring packages:** `@lumpcode/cli` depends on exact versions of `@lumpcode/recipes` and `@lumpcode/cli-utils`. Imports of `@lumpcode/{recipes,cli-utils,cli-types,core}` resolve to the project's install when present, otherwise to the CLI's copy. Owner: `resolveAuthoringPackage`. `lump-plan` shows the source and version and warns on a mismatch. Editor types: `.lumpcode/tsconfig.json` plus a generated, gitignored `.lumpcode/.types/`.
- **Templates are a convention:** `.lumpcode/templates/<name>.ts` (or `.js`) exports `defineLump(config) → LumpJsConfig`. Plain JavaScript decides merging. A repo may have several. `lump-create --template <name>` relies on the convention (default `main` when present; `--noTemplate` opts out). The docs present it as a convention and a good practice.
- **One template text:** `renderLumpTemplate` writes the same file as the install prompt, from the same four values (command, model, workspace setup command, PRs with `gh`).
- **Format:** `detectConfigFormat` proposes TypeScript or JavaScript from the repo; the user confirms or changes it. JSON is experimental and never uses a template.
- **Recipe registry:** owned by `@lumpcode/recipes` (name, one-line description, starter files); `lump-create` only reads it.

## Tickets

Everything here comes after the 0.11.0 release and will be re-grilled then. The umbrella depends on `release-0-11-0` and `workflow-api-config-and-plan` (a ticket's own `dependsOn` only names siblings), so every ticket here waits for the `workflow` config field. This repo's own template is the top-level item `repo-templates` (priority 10), done first by hand.

| Order | Ticket | Delivers | Requirements |
| --- | --- | --- | --- |
| 20 | `drop-sea-binaries` | npm only, one Node runtime, E2E on Node | `tickets/drop-sea-binaries/requirements.md` |
| 21 | `cli-bundled-authoring-packages` | `@lumpcode/*` imports work with only the CLI; editor types | `tickets/cli-bundled-authoring-packages/requirements.md` |
| 22 | `ts-default-scaffolding` | Detected format with confirmation; `setup` writes `templates/main`; `lump-create --template`; `workflow` stubs | `tickets/ts-default-scaffolding/requirements.md` |
| 23 | `lump-create-from-recipe` | `lump-create --recipe` and the recipe registry | to write |
| 24 | `open-pr-providers` | GitLab, Azure DevOps, Bitbucket in `openPrPostTeardown` | to write |

## Acceptance criteria

- In a repo with only `.py` files, `npm i -g @lumpcode/cli`, `lumpcode setup`, then `lumpcode lump-create demo --recipe backlog` gives a lump wrapped in `templates/main.ts` that passes `lump-plan`, with no `package.json` and no root `tsconfig.json`.
- The editor shows no unresolved `@lumpcode/*` import in that lump.
- `--config json` still works, with the experimental warning.
