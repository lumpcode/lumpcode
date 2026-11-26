# Requirements: TypeScript by default, with a template

| Field | Value |
| --- | --- |
| **Backlog** | `factory-templates` / `ts-default-scaffolding` · priority **22** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `cli-bundled-authoring-packages` (a TypeScript lump and its template run with only the CLI); through the umbrella, `workflow-api-config-and-plan` (the `workflow` field) |
| **Packages** | `@lumpcode/cli` (primary: `commands/setup`, `commands/lump-create`, two new utils). `packages/apps/website/app/assets/install-prompt.md` (kept identical). `@lumpcode/core`, `cli-utils`, `cli-types` and `recipes` stay unchanged. |

## Problem statement and motivation

The way to use Lumpcode is a template that holds the team's needs, then lumps that wrap their config in it. The install prompt already creates `.lumpcode/templates/main.ts` exporting a plain `defineLump(config)`. The CLI does not.

1. `setup` asks "First lump config format" with JSON as the default, and `lump-create` defaults to JSON.
2. `setup` writes no template, so every lump repeats the command, the model, the worktree preparation and the PR helper.
3. `lump-create` writes a stub with `baseBranch: 'main'` and `command: 'claude-code'` hardcoded, ignoring any template.
4. The install prompt and `setup` produce different projects for the same answers.

Templates are a convention, not a library feature: a file under `.lumpcode/templates/<name>.ts` (or `.js`) that exports `defineLump(config)`. Plain JavaScript decides how it merges. A repo can have several. Some command options rely on the convention (`lump-create --template`).

## Goals

1. `setup` and `lump-create` propose a format from the repo, say why, and let the user change it.
2. `setup` asks four questions and writes `.lumpcode/templates/main.ts` (or `.js`) identical to the install prompt's for the same values.
3. New lumps import `defineLump` from a template unless the user opts out.
4. JSON still works, labeled experimental, with no template.

## Non-goals

- A `defineTemplate` or any merge helper in `@lumpcode/recipes`.
- `lump-create --recipe` (`lump-create-from-recipe`).
- Non-interactive `setup` (`worker-deploy` / `setup-non-interactive`); this ticket only exposes the detected default for it.
- PR providers other than GitHub `gh` (`open-pr-providers`).
- Migrating existing lumps. This repo's lumps already use their template (top-level `repo-templates`).

## User stories / use cases

1. As a newcomer in a Python repo, `setup` proposes TypeScript because there is no `package.json`, I press Enter, answer four template questions, and get a template plus a first lump that uses it.
2. As a JavaScript team, `setup` proposes JavaScript because `package.json` has no TypeScript, and I get `templates/main.js`.
3. As a team with a template, `lumpcode lump-create cleanup` gives me a lump that already imports `defineLump`.
4. As an author with two templates, `lump-create docsSweep --template docs` wraps the lump in `templates/docs.ts`.
5. As an author who wants a bare lump, `--noTemplate` writes a plain config.
6. As a JSON user, `--config json` still works and tells me JSON is experimental.

## Proposed behavior and UX

### Format detection (`detectConfigFormat`)

| Repo state (project root) | Proposed | Reason shown |
| --- | --- | --- |
| `.lumpcode/templates/` holds `main.ts` or `main.js` (`lump-create` only) | that file's format | `matches .lumpcode/templates/main.<ext>` |
| `tsconfig.json`, or `typescript` in `package.json` dependencies or devDependencies | `ts` | `tsconfig.json found` / `typescript in package.json` |
| `package.json` without either | `js` | `package.json without TypeScript` |
| no `package.json` | `ts` | `no package.json` |

### Format question

Asked by `setup` always, and by `lump-create` when stdin is a TTY, unless `--config` is passed:

```text
Lump format: TypeScript (no package.json). Use it? (Y/n)
```

On `n`:

```text
  1. TypeScript
  2. JavaScript
  3. JSON (experimental: no template, recipes unavailable)
```

Without a TTY and without `--config`, the proposed format is used with no prompt. `--config json` prints `JSON configs are experimental. TypeScript is the supported format.` and continues.

### Template questions (`setup` only, when no `.lumpcode/templates/main.{ts,js}` exists)

| Order | Question | Default on Enter | Value |
| --- | --- | --- | --- |
| 1 | Command (agent) | the detected agent, as today (`chooseCommand`) | `COMMAND` |
| 2 | Model | `auto` for `cursor` and `copilot`; blank for others | `MODEL`. Blank: `model` is omitted and a comment says the agent uses its own default |
| 3 | Workspace setup command | `npm i`; blank when there is no `package.json` | `INSTALL_COMMAND`. Blank: the worktree preparation only copies `.env` files |
| 4 | Open pull requests with gh? | no | `OPEN_PR` |

When question 4 is yes and `gh auth status` fails, keep yes and print `gh is not logged in on this machine. The worker needs gh logged in to open pull requests.`

When `templates/main.{ts,js}` exists, these questions are skipped and the file is not touched. The first lump uses it.

### Template file

`.lumpcode/templates/main.ts` (or `.js`) is the install prompt's template (Step 5 of `install-prompt.md`) with the four constants filled in: `prepareWorktree`, `copyEnvFiles`, and `defineLump<V, SV>(config) → LumpJsConfig<V, SV>`. The JavaScript file is the same code without type imports and annotations.

### `lump-create`

```text
lumpcode lump-create <lumpName> [--config ts|js|json] [--template <name> | --noTemplate]
```

| Case | Result |
| --- | --- |
| no template flag, `templates/main.<ext>` exists | config wraps in `main` |
| no template flag, no `main` | plain config, as today |
| `--template <name>`, file exists | config wraps in that template |
| `--template <name>`, missing | fails: `No template .lumpcode/templates/<name>.ts. Available: main, docs.` (or `none`) |
| `--template` and `--noTemplate` together | fails: `Use --template or --noTemplate, not both.` |
| `--config json` | never wraps; a template flag with JSON fails: `JSON lumps cannot use a template.` |

A wrapped config imports `defineLump` from the relative path to the template and has no `command` and no `baseBranch`. A plain TS or JS config has no `baseBranch` either (the stub's hardcoded `'main'` is removed). The context source stays the current one; the work is a `workflow`, never `prompt` or `steps`:

```ts
async workflow({ context, agent }) {
  await agent.prompt(`<the current stub prompt text, with ${context.name}>`);
},
```

The JSON stub (experimental) keeps `prompt`, since JSON has no `workflow`.

### `setup` first lump

Same rules as `lump-create` with the `main` template: the JS/TS stub `writeJsTsStub` writes `defineLump({ contextMatchFn…, async workflow({ context, agent }) { … } })` without `command`.

## Technical approach

| Step | Files | Change |
| --- | --- | --- |
| 1 | new util `packages/apps/cli/src/utils/detectConfigFormat/` | `detectConfigFormat({ projectRoot, preferTemplates }) → { format: 'ts' \| 'js', reason: string }`. **Single owner** of the detection table. `setup`, `lump-create` and later `setup-non-interactive` call it. |
| 2 | new util `packages/apps/cli/src/utils/renderLumpTemplate/` | `renderLumpTemplate({ format: 'ts' \| 'js', command, model?, installCommand, openPr }) → string`. **Single owner** of the template file text. Also exports `listTemplates({ projectRoot }) → string[]` and `templateImportPath({ lumpDir, templateFile }) → string`. |
| 3 | `commands/setup/main.ts` | Replace `chooseConfigFormat` with the detect-and-confirm prompt. Add the model, workspace setup command and PR questions after `chooseCommand`. Write `templates/main.<ext>` with `renderLumpTemplate` when missing. Stubs import `defineLump`. Add `.lumpcode/templates/` to the files setup reports and commits (`setup/main.ts:88` list). |
| 4 | `commands/lump-create/main.ts` | `--template`, `--noTemplate`; default format from `detectConfigFormat` (with `preferTemplates`), asked on a TTY; wrapped and plain stub bodies; remove `baseBranch: 'main'` and the hardcoded command from JS/TS stubs. The `--config` help text drops "(default json)". |
| 5 | `packages/apps/website/app/assets/install-prompt.md` | Step 5: for a repo with no `package.json`, create `templates/main.ts`. The snippet stays the reference text. |

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `detectConfigFormat/unit.test.ts` | Each row of the detection table, with fixtures under `os.tmpdir()` |
| Unit | `renderLumpTemplate/unit.test.ts` | TS and JS output; blank model omits `model` with the comment; blank install command; `openPr` on and off |
| Unit | sync test in `renderLumpTemplate` | The TS output for the install prompt's example values (`cursor`, `auto`, `npm ci`, `true`) equals the TS code block in `install-prompt.md` |
| Unit | `setup` tests (`general`, `jsTsStubs`, `resume`) | Format confirm and change; four template questions; existing template skips them; JSON warning. Update tests that select a format by number and that expect a `command` in the stub. |
| Unit | `lump-create/unit.test.ts` | Every row of the `lump-create` table; the default stub has no `baseBranch`; non-TTY uses the detected default |
| Integration | `lump-create` then `lump-plan` | A wrapped lump in a repo with no `package.json` passes `lump-plan` |

## Docs updates

| Document | Change |
| --- | --- |
| `DOCS/reference/commands.md` | `lump-create` flags `--template`, `--noTemplate`; detected default format; `setup` template questions |
| `DOCS/author/write-a-lump.md` | One canonical "Templates" section: a convention (`.lumpcode/templates/<name>.ts` exporting `defineLump`), several allowed, used by `lump-create --template`, a good practice for agent, model, worktree setup and PRs |
| `DOCS/start/first-pr.md` | `setup` now writes a template; the format question shows the detected default |
| `.agents/memory/domain/repo-lumps.md` | Shared wrapper functions live in `.lumpcode/templates/`; other shared lump code stays in `.lumpcode/helpers/` |

## Acceptance criteria

1. In a repo with no `package.json`, `setup` proposes TypeScript with the reason, and Enter accepts it.
2. `setup` writes `.lumpcode/templates/main.ts` with the four answers, and the first lump imports `defineLump` from it and passes `lump-plan`.
3. For `cursor`, `auto`, `npm ci` and PRs on, the generated template equals the install prompt's snippet.
4. A second `setup` run with an existing template asks none of the four template questions and leaves the file unchanged.
5. `lump-create` follows every row of its table, no generated stub contains `baseBranch: 'main'`, and every TS or JS stub uses `workflow`.
6. `--config json` works and prints the experimental warning.
7. Format detection lives only in `detectConfigFormat` and the template text only in `renderLumpTemplate`.
