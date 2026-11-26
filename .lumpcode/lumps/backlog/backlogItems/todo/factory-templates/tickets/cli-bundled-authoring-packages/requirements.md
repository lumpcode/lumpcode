# Requirements: Authoring packages come with the CLI

| Field | Value |
| --- | --- |
| **Backlog** | `factory-templates` / `cli-bundled-authoring-packages` · priority **21** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `drop-sea-binaries` (one Node runtime, esbuild JS API only) |
| **Packages** | `@lumpcode/cli` (primary: `package.json` dependencies, `utils/transpileTypeScriptToCachedMjs`, one new util, `lump-plan`, `run`, the daemon log, `setup`). `@lumpcode/cli-types` (public typings without `zod`). `@lumpcode/core`, `cli-utils` and `recipes` stay unchanged. |

## Problem statement and motivation

TypeScript is the documented way to write a lump, and templates and recipes import `@lumpcode/recipes` and `@lumpcode/cli-utils`. Today those imports only work when the project installed the packages. Verified on CLI 0.10.1 in a repo with only `.py` files and `.lumpcode/`:

| `config.ts` imports | Result |
| --- | --- |
| a relative `.ts` file, `node:fs`, TypeScript types | runs |
| `import type { LumpJsConfig } from '@lumpcode/cli-utils'` | runs (type imports are erased) |
| `import { retryUntilGreen } from '@lumpcode/recipes'` | `ERR_MODULE_NOT_FOUND: Cannot find package '@lumpcode/recipes' imported from .lumpcode/.cache/transpile/<hash>/<mtime>/out.mjs` |

1. A Python, Go or Java repo needs a `package.json` and `node_modules` only to run a lump.
2. A worker clone fails until someone runs `npm install` there.
3. `setup` asks to install the packages, and the install prompt runs `npm install --save-dev @lumpcode/cli-utils @lumpcode/recipes`.
4. Without `node_modules`, the editor reports `Cannot find module` and gives no autocomplete.
5. The published `cli-types` typings import `zod`, which is not one of its dependencies.

## Goals

1. With only `npm i -g @lumpcode/cli`, a lump that imports any `@lumpcode/{recipes,cli-utils,cli-types,core}` module runs, in any repo, on a laptop or a worker.
2. A project that installed one of those packages runs its own copy.
3. The operator sees which copy and version each import uses, and is warned when the project's version differs from the CLI's.
4. Editors type-check lumps with no install in the repo.
5. `setup` never installs a package.

## Non-goals

- Providing any other npm package. Those keep needing a project install.
- Changing recipe, kit or `cli-utils` APIs.
- Writing a `package.json`, a root `tsconfig.json` or `node_modules` into the user's repo.
- Template scaffolding (`ts-default-scaffolding`).

## User stories / use cases

1. As a Python team, I install the CLI, write a lump that wraps `featureBacklog`, and `lumpcode run` works with no `package.json`.
2. As an operator, I `npm i -g @lumpcode/cli` on a fresh worker clone and `lumpcode start` runs my recipe lumps without `npm install`.
3. As a JavaScript team that pinned `@lumpcode/recipes@0.9.0`, my lumps keep using 0.9.0, and `lump-plan` tells me the CLI ships 0.10.1.
4. As a lump author with no `node_modules`, my editor autocompletes `featureBacklog({…})`.
5. As an author who imports `lodash` in a lump, the error tells me to install it in the project.

## Proposed behavior and UX

### Covered packages

| Specifier | Covered |
| --- | --- |
| `@lumpcode/recipes`, `@lumpcode/cli-utils`, `@lumpcode/cli-types`, `@lumpcode/core`, and their subpaths (`@lumpcode/recipes/schemas/…`) | yes |
| any other package | no, unchanged (external, resolved by Node from the project) |

### Resolution rule, per covered import in a lump file (or any file it reaches)

1. Resolvable from that file with Node resolution (`createRequire(<file>).resolve(<specifier>)`, which walks up through hoisted `node_modules`): use the project's copy, import unchanged.
2. Otherwise: use the CLI's own installed copy, imported by absolute file URL, still external to the bundle.

### `package.json` of `@lumpcode/cli`

`dependencies` gains `@lumpcode/recipes` and `@lumpcode/cli-utils` at the exact version of the CLI release (no range). `cli-types` and `core` come through them, as `core` does today.

### Visibility

`lump-plan` prints one line per covered package the lump imports, after the existing summary lines:

```text
authoring: @lumpcode/recipes 0.10.1 (bundled with the CLI)
authoring: @lumpcode/cli-utils 0.9.0 (project)
```

When a project copy's version differs from the CLI's version, `lump-plan` and `run` print this warning, and a daemon writes it to its log once per lump per daemon start:

```text
@lumpcode/cli-utils 0.9.0 from the project differs from CLI 0.10.1. Update it, or remove it to use the CLI's copy.
```

This is a warning only. Exit codes do not change. `lump-plan --json` gains `authoringPackages: { name, source: 'project' | 'cli', version }[]`.

### Non-covered package missing

The import failure message gains one sentence: `Install <package> in the project; only @lumpcode/* packages come with the CLI.`

### Editor types

| Path | Committed | Written by | Content |
| --- | --- | --- | --- |
| `.lumpcode/tsconfig.json` | yes | `setup` and `lump-create`, only when the file is missing | `noEmit`, `strict`, `moduleResolution: "Bundler"`, `include: ["**/*.ts"]`, and `paths` for `@lumpcode/recipes`, `@lumpcode/cli-utils`, `@lumpcode/cli-types`, `@lumpcode/core` (and `/*` subpaths), each trying `../node_modules/<pkg>` first, then `./.types/<pkg>`. `types: ["node"]` only when `@types/node` resolves from the project. |
| `.lumpcode/.types/<pkg>/` | no (gitignored) | `setup`, `lump-create`, `lump-plan`, `run` (not the daemon) | `package.json` and `.d.ts` files of the four packages, copied from the CLI's install. No JavaScript. |
| `.lumpcode/.types/.version` | no | same | the CLI version that wrote the folder. A different version rewrites the whole folder. |

`.lumpcode/.types/` is ignored the same way `.lumpcode/.cache/` is today: `appendMissingGitignoreLines` adds the line to the project's root `.gitignore` when missing, and the `.lumpcode/.gitignore` body written by `scaffoldLumpcodeProject` gains it for new projects. An existing `.lumpcode/tsconfig.json` is never modified.

### `setup`

The question `Install @lumpcode/cli-utils and @lumpcode/recipes?` and its `npm install` are removed.

## Technical approach

| Step | Files | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/package.json` | Exact-version dependencies on `@lumpcode/recipes` and `@lumpcode/cli-utils`. The release process bumps them with the CLI version. |
| 2 | new util `packages/apps/cli/src/utils/resolveAuthoringPackage/` | `resolveAuthoringPackage({ specifier, importerPath }) → Success<{ name, source: 'project' \| 'cli', version, resolvedPath }> \| Failure<string>`, plus the `AUTHORING_PACKAGES` list. **Single owner** of the covered list, the project-first rule and reading the resolved version. No other module decides which copy is used. |
| 3 | `utils/transpileTypeScriptToCachedMjs/main.ts` | Always bundle with `packages: 'external'` (the output is unchanged for non-bundled entries). An esbuild `onResolve` plugin for covered specifiers calls `resolveAuthoringPackage` and returns the CLI copy's absolute path as external when the source is `cli`. The transpile returns the list of `AuthoringPackageSource` it used. |
| 4 | same file | The cache key adds the CLI version and, per covered import, its source and resolved path, so a CLI update or a Node switch invalidates the cache. |
| 5 | `utils/resolveImportable/main.ts` and the import failure path | Append the "only @lumpcode/* packages come with the CLI" sentence to `ERR_MODULE_NOT_FOUND` for a non-covered package. |
| 6 | new util `packages/apps/cli/src/utils/writeAuthoringTypes/` | `writeAuthoringTypes({ projectRoot }) → Success<void> \| Failure<string>`: owns `.lumpcode/.types/` and its `.version` check, and the gitignore line. `ensureLumpcodeTsconfig({ projectRoot })` in the same util owns writing `.lumpcode/tsconfig.json` when missing. |
| 7 | `commands/lump-plan`, `commands/run`, daemon tick logging | Print the `authoring:` lines and the version warning from the transpile result. `lump-plan --json` field. Daemon: once per lump per start. |
| 8 | `commands/setup/main.ts` | Remove `maybeInstallAuthoringPackages` and `AUTHORING_PACKAGES_INSTALL`. Call `ensureLumpcodeTsconfig` and `writeAuthoringTypes`. |
| 9 | `packages/apps/cli/src/types` feeding `cli-types` | `ResolvedProjectLocalConfig` becomes a plain TypeScript type instead of `z.infer<…>`, so `cli-types/dist/index.d.ts` has no `zod` import. The CLI keeps its schema and checks the two stay equal with a type-level test. |

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `resolveAuthoringPackage/unit.test.ts` | Project copy wins; CLI fallback; subpaths; version read; non-covered specifier rejected |
| Unit | `writeAuthoringTypes/unit.test.ts` | Folder written, rewritten on version change, untouched on same version; tsconfig written only when missing |
| Integration | `transpileTypeScriptToCachedMjs` tests with fixtures under `os.tmpdir()` | No `node_modules`: recipes import runs from the CLI copy. With a project copy: that copy is used. Cache invalidates when the CLI version changes. |
| Integration | `lump-plan` tests | `authoring:` lines, mismatch warning, `--json` field |
| Unit | `setup` tests (`jsTsStubs.unit.test.ts`, `general.unit.test.ts`) | The install question is gone; tsconfig and `.types` are written. Existing assertions about the install prompt are removed. |
| Type | cli-types build check | `dist/index.d.ts` contains no `from 'zod'` |
| E2E | new scenario | A fixture repo with no `package.json` runs a lump that imports `@lumpcode/recipes`, through the globally packed CLI |

## Docs updates

| Document | Change |
| --- | --- |
| `DOCS/start/first-pr.md`, `DOCS/start/worker.md` | Remove "add `@lumpcode/cli-utils` and `@lumpcode/recipes` to `package.json`" and the worker `npm install` warning for TypeScript lumps |
| `DOCS/author/recipes.md` | "Installed with the CLI. Install it in the project only to pin a version." |
| `DOCS/reference/troubleshooting.md` | The version mismatch warning and the "only @lumpcode/* packages" message |
| `packages/apps/website/app/assets/install-prompt.md` | Remove the authoring packages install step |
| `.agents/memory/domain/distribution.md` | Replace the "recipe configs need the packages under the project" line |

## Acceptance criteria

1. In a repo with no `package.json` and no root `tsconfig.json`, a lump importing `retryUntilGreen` from `@lumpcode/recipes` passes `lump-plan` and runs, with only the global CLI installed.
2. With `@lumpcode/recipes` installed in the project at another version, the lump uses it, `lump-plan` shows `(project)` and the warning, and the exit code is unchanged.
3. After the CLI is upgraded, the next `lump-plan` recompiles the lump and rewrites `.lumpcode/.types/`.
4. In that repo, opening `.lumpcode/lumps/<name>/config.ts` in VS Code shows no unresolved `@lumpcode/*` import.
5. `setup` never prompts to install a package and never runs a package manager.
6. The published `cli-types` typings do not import `zod`.
7. Only `resolveAuthoringPackage` decides which copy an import uses; `lump-plan`, `run` and the daemon only read its result.
