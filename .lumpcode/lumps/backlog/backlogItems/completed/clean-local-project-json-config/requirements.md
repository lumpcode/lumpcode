# Requirements: Clean local.json / project.json ownership and merge

| Field | Value |
| --- | --- |
| **Backlog** | `clean-local-project-json-config` · priority **5** · `manualReq` |
| **Type** | feature |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `packages/apps/cli` (types, utils, `project-setup`, Zod validation, editor JSON schemas, DOCS, unit/e2e). `@lumpcode/core`, `cli-types`, `cli-utils`, `recipes` unchanged. |

## Problem statement and motivation

`.lumpcode/local.json` and `.lumpcode/project.json` have fuzzy ownership. Team-useful settings (primary branch, default agent command, open-branch cap) are stuck in the gitignored local file or documented on `project.json` without a real merge. Operators cannot commit shared defaults; every lump repeats `command`; docs claim `maximumNumberOfConcurrentBranches` on `project.json` but runtime only reads `projectName`.

Pain points:

1. No clear local-only vs project-only vs shared field membership.
2. No merge with local overriding project for shared keys.
3. No project/local defaults for selected lump fields (`command`, caps, history, verbose).
4. `project-setup` scaffolds primary branch only into `local.json`, pushing team defaults into a gitignored file.
5. Editor schemas / DOCS drift from behavior.

## Goals

1. **Clear field membership** — local-only, project-only, shared, and lump-default layers as specified below.
2. **One merge model** — shared keys: local wins over project; lump defaults: lump > local > project where the field exists on that layer.
3. **Strict validation** — misplaced known keys and unknown keys hard-fail per file; primary-branch presence validated on the **merged** result.
4. **Lump defaults** — `run`, `start`, `lump-plan`, and `lump-status` all see the same effective lump config after defaults apply.
5. **`project-setup` scaffold** — commit `primaryBranch` on `project.json`; thin `local.json` with `mode` only.
6. **Types from Zod** — resolved schema is the value-type source of truth; file shapes `Pick` from it.
7. **Docs + editor schemas** — `local-config.md`, `project-config.md`, related DOCS, `localConfig.schema.json`, and `projectConfig.schema.json` match runtime.

## Non-goals

- New CLI flags or alternate config file paths for one-shot overrides (existing `--maxParallelRun` on `start`, `--discoveryBranch` on `run` / plan / status stay as today).
- Allowing file-path `command` modules in `project.json` / `local.json` (tag shape only).
- Putting `numberOfContextsPerBranch` on project/local.
- Migrating or rewriting existing installs’ `local.json` / `project.json`.
- Changing `@lumpcode/core` APIs.
- Publishing new public types from `cli-types` / `cli-utils` for this surface (CLI-internal types are enough).
- Changing daemon identity, locks, or workspace strategies beyond reading the merged config.

## User stories / use cases

1. **Team lead** — Commits `"primaryBranch": "dev"` and `"command": "cursor"` in `project.json`. Contributors’ lumps omit top-level `command` and inherit `cursor`.
2. **Operator (machine override)** — Sets `"primaryBranch": "main"` and `"verbose": true` in gitignored `local.json`; local primary wins over project; verbose applies when the lump omits it.
3. **Operator (daemon pause)** — `"disabled": true` remains local-only; daemon skips all lumps on that machine; lump `disabled` is unrelated.
4. **New project** — `lumpcode project-setup` writes `project.json` with `projectName` + `primaryBranch`, and `local.json` with `{ "mode": "shared" }` (or dedicated).
5. **Author (mistake)** — Puts `"mode"` in `project.json` or `"command": "./agent.ts"` in `local.json` → hard-fail with a clear error.

## Proposed behavior and UX

### Field membership

| Field | project.json | local.json | lump config | Notes |
| --- | --- | --- | --- | --- |
| `projectName` | required | — | — | project-only |
| `mode` | — | required | — | local-only |
| `workspaceStrategy` | — | optional (default `checkout`) | — | local-only |
| `disabled` | — | optional | — | local-only; machine daemon pause (not lump `disabled`) |
| `maxParallelRun` | — | optional | — | local-only |
| `primaryBranch` | optional | optional | — | shared; local wins |
| `primaryBranches` | optional | optional | — | shared; local wins |
| `projectBaseBranch` | optional | optional | — | shared; deprecated; local wins; existing warn via `resolvePrimaryBranches` |
| `command` | optional | optional | optional | lump default; project/local **tag shape only** |
| `maximumNumberOfConcurrentBranches` | optional | optional | optional | lump default |
| `keepHistory` | optional | optional | optional | lump default |
| `verbose` | — | optional | optional | lump default; not on project |
| `numberOfContextsPerBranch` | — | — | optional | lump-only (unchanged) |

Misplaced known keys and unknown keys → **hard-fail** at file read (Zod `.strict()` / JSON Schema `additionalProperties: false`).

### Merge and precedence

**Project + local (machine/project surface):** for every key present on both layers, **local wins**. Keys only on one layer use that layer. Apply `workspaceStrategy` default `checkout` when omitted after merge (same default as today).

**Primary branch:** after merge, require a non-empty primary source with the **same rules as today’s** `readLocalConfig` / `resolvePrimaryBranches` (`primaryBranches` non-empty, or `primaryBranch`, or deprecated `projectBaseBranch`). Either file may supply it; missing from both → hard-fail naming both files.

**Lump defaults** (only these keys): `command`, `maximumNumberOfConcurrentBranches`, `keepHistory`, `verbose`.

Precedence where the field exists on that layer: **lump > local > project**.

Inherit when the lump value is **`undefined`** (omitted or explicit `undefined`). Any other lump value (including `false` / `0`) wins. No deep merge.

### `command` on project/local

- Must be a **registered-tag shape**: reject values that match the lump **file-path command** rule (entire string has no whitespace and ends with `.ts` or `.js`).
- Do **not** require the tag to resolve to an on-disk module at project/local read time; missing tags fail later at command resolve (same as lump-level tags).
- Lump-level `command` may still be a tag or lump-relative `.ts`/`.js` path.

### Types and Zod (contracts)

Canonical value types come from one resolved Zod schema:

```ts
resolvedProjectLocalConfigSchema // z.ZodType
type ResolvedProjectLocalConfig = z.infer<typeof resolvedProjectLocalConfigSchema>
// T ≡ ResolvedProjectLocalConfig
```

Resolved object includes all membership fields above (after defaults such as `workspaceStrategy`). Super-refine enforces merged primary-branch presence.

File shapes reuse field types via `Pick` (no duplicated literals):

```ts
type ProjectJsonConfig = Pick<
  ResolvedProjectLocalConfig,
  | 'projectName'
  | 'primaryBranch'
  | 'primaryBranches'
  | 'projectBaseBranch'
  | 'command'
  | 'maximumNumberOfConcurrentBranches'
  | 'keepHistory'
>; // projectName required on the file schema; others optional

type LocalJsonConfig = Pick<
  ResolvedProjectLocalConfig,
  | 'mode'
  | 'workspaceStrategy'
  | 'disabled'
  | 'maxParallelRun'
  | 'primaryBranch'
  | 'primaryBranches'
  | 'projectBaseBranch'
  | 'command'
  | 'maximumNumberOfConcurrentBranches'
  | 'keepHistory'
  | 'verbose'
>; // mode required on the file schema; others optional
```

Replace today’s `LocalConfig` / `ProjectConfig` with these names (or type-aliases during the change). Call sites that froze `LocalConfig` at daemon start take **`ResolvedProjectLocalConfig`** (or a documented Pick of machine fields plus access to lump-default fields for `applyLumpConfigDefaults`).

### Canonical owners

| Concern | Owner | Non-owners |
| --- | --- | --- |
| Read + strict-validate `project.json` | `readProjectJson` (`packages/apps/cli/src/utils/readProjectJson/`) | Callers must not `JSON.parse` project.json ad hoc |
| Read + strict-validate `local.json` | `readLocalConfig` (updated allowlist; **no** per-file primary-branch requirement) | — |
| Merge project+local, default `workspaceStrategy`, validate resolved schema → `T` | `readProjectLocalConfig` (`packages/apps/cli/src/utils/readProjectLocalConfig/`) | Commands/utils must not reimplement merge or primary-branch-on-merge checks |
| Overlay lump-default keys onto a loaded `LumpJsConfig` | `applyLumpConfigDefaults` (`packages/apps/cli/src/utils/applyLumpConfigDefaults/`) | Not inside `@lumpcode/core`; not duplicated per command |
| Primary-branch list resolution + deprecated `projectBaseBranch` warn | existing `resolvePrimaryBranches` / `resolvePrimaryBranch` | Feed them the merged primary fields from `T` |
| `projectName` for callers that only need the name | `getProjectName` may keep existing signature but **must** validate via `readProjectJson` (or equivalent) so membership/unknown keys still hard-fail | — |

`readProjectLocalConfig` signature:

```ts
readProjectLocalConfig(input: {
  localConfigFolderPath: string;
}): Promise<Success<ResolvedProjectLocalConfig> | Failure<string>>
```

`applyLumpConfigDefaults` signature:

```ts
applyLumpConfigDefaults(input: {
  jsConfig: LumpJsConfig;
  resolved: ResolvedProjectLocalConfig;
}): LumpJsConfig
```

Keys copied when lump value is `undefined`: `command`, `maximumNumberOfConcurrentBranches`, `keepHistory`, `verbose` (only from layers that allow them; `verbose` never from project).

**Apply timing:** after successful lump config load (`getJsConfigFromLumpName` or equivalent), **before** `jsConfigToRunLumpInput`, branch-cap checks, plan preview, and status surfaces that reflect effective lump fields. Required call paths: `runLumpFromLumpName`, `planLumpFromJsConfig`, and `lump-status` loading paths that expose effective config. Daemon `start` freezes one `readProjectLocalConfig` result for the process (same freeze semantics as today’s `local.json` read-once).

### `project-setup`

| File | New scaffold |
| --- | --- |
| `.lumpcode/project.json` | `{ "projectName": "<…>", "primaryBranch": "<from --primaryBranch, default main>" }` |
| `.lumpcode/local.json` | `{ "mode": "<shared\|dedicated>" }` only |

No rewrite of existing files on upgrade. Still gitignore `local.json`; still commit `project.json`.

### Operator-visible examples

`project.json`:

```json
{
  "projectName": "my-monorepo",
  "primaryBranch": "dev",
  "command": "cursor",
  "maximumNumberOfConcurrentBranches": 2,
  "keepHistory": true
}
```

`local.json`:

```json
{
  "mode": "dedicated",
  "workspaceStrategy": "worktree",
  "maxParallelRun": 3,
  "verbose": true
}
```

## Technical approach

1. **Schemas/types** — Add `resolvedProjectLocalConfigSchema` and inferred `ResolvedProjectLocalConfig`; define `ProjectJsonConfig` / `LocalJsonConfig` via `Pick`; remove or alias old `LocalConfig` / `ProjectConfig`.
2. **`readProjectJson`** — Strict project file parse (required `projectName` rules unchanged: `^[a-zA-Z0-9_-]+$`); reject path-shaped `command`.
3. **Update `readLocalConfig`** — Local allowlist + `.strict()`; drop per-file primary-branch requirement; reject path-shaped `command`; reject project-only / disallowed keys.
4. **`readProjectLocalConfig`** — Read both files, merge (local wins), default `workspaceStrategy`, validate resolved schema (merged primary required).
5. **Wire callers** — Replace dual `readLocalConfig` + ad hoc project reads with `readProjectLocalConfig` where both are needed (`start`, `run` / `runLumpFromLumpName`, `resolveProjectExecutionContext`, `planLumpFromJsConfig`, `clean`, companions as applicable). Pass `T` instead of bare `LocalConfig`.
6. **`applyLumpConfigDefaults`** — Implement overlay; call on all run/plan/status load paths listed above so `maximumNumberOfConcurrentBranches` from project/local is actually enforced (fixes docs/runtime gap).
7. **`getProjectName`** — Route through strict project read.
8. **`project-setup`** — Write new scaffold shapes.
9. **Editor JSON schemas** — Update `localConfig.schema.json`; add `projectConfig.schema.json` (`additionalProperties: false`, membership, no required primary on local alone; project requires `projectName`).
10. **DOCS** — Align pages in Docs updates table.
11. **Tests** — See Testing strategy.

## Testing strategy

### Unit

| Area | Coverage |
| --- | --- |
| `readProjectJson` / `readLocalConfig` | Allowlist membership; unknown key fail; misplaced key fail; path-shaped `command` fail; tag `command` accept |
| `readProjectLocalConfig` | Local wins shared primary; primary only on project OK; primary only on local OK; missing both fails; `workspaceStrategy` default; lump-default fields present on `T` |
| `applyLumpConfigDefaults` | Lump wins when set; `undefined` inherits local then project; `false`/`0` not overridden; `verbose` not read from project; `command` overlay |
| `project-setup` | Writes `projectName`+`primaryBranch` to project.json and mode-only local.json |
| `resolvePrimaryBranches` | Still works when primary fields come from merged `T` (incl. deprecated warn) |
| Branch cap | Project/local `maximumNumberOfConcurrentBranches` applied before skip evaluation when lump omits it |

### Integration / existing suite updates

| Suite | Why |
| --- | --- |
| `readLocalConfig/unit.test.ts` | Primary no longer required on local alone; new fields; strict unknown keys |
| `getProjectName/unit.test.ts` | Strict project parse / unknown keys |
| `project-setup` unit/e2e | New scaffold contents |
| `runLumpFromLumpName` / `runLumpFromJsConfig` / plan tests | Provide merged config / prove default `command` and branch cap from project/local |
| Fixtures using `writeLocalJson` | May need `primaryBranch` on project.json when removed from local |

### E2E

| Case | Assert |
| --- | --- |
| Fresh `project-setup` | File shapes match scaffold contract |
| Run lump with `command` only on `project.json` | Lump without top-level `command` still runs via inherited tag (mock agent) |
| Optional: local overrides project `primaryBranch` | Preflight/status use local primary |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/local-config.md` | Membership; shared vs local-only; merge; lump defaults; primary may live only on project.json |
| `packages/apps/cli/DOCS/project-config.md` | Full project allowlist; `command` tag-only; `keepHistory`; shared primary; link merge rules |
| `packages/apps/cli/DOCS/get-started.md` | Scaffold output; where to set primary/command |
| `packages/apps/cli/DOCS/lump-config.md` | Note top-level `command` / caps / history / verbose may inherit from project/local |
| `packages/apps/cli/DOCS/commands.md` | `project-setup` written files; `local.json` freeze still one read of merged surface at daemon start |
| `packages/apps/cli/DOCS/concepts.md` | Short pointer to project/local defaults + precedence (canonical detail in local/project docs) |
| `packages/apps/cli/src/schemas/localConfig.schema.json` | Align with `LocalJsonConfig` |
| `packages/apps/cli/src/schemas/projectConfig.schema.json` | New; align with `ProjectJsonConfig` |
| `packages/apps/cli/README.md` | Only if it still claims primary lives only in `local.json` |

No migration guide. Document current spelling only.

## Acceptance criteria

1. Field membership matches the table; violations and unknown keys hard-fail with clear errors.
2. Shared keys: local overrides project; merged primary-branch validation passes when either file supplies a valid source and fails when neither does.
3. Lump defaults apply with lump > local > project; `undefined` inherits; `false`/`0` do not.
4. Project/local `command` rejects path-shaped values; accepts tags without existence check at read time.
5. `run`, `start`, `lump-plan`, and `lump-status` use the same merge + `applyLumpConfigDefaults` behavior (no path skips defaults).
6. `maximumNumberOfConcurrentBranches` from project/local is enforced when the lump omits it.
7. `project-setup` writes the new scaffold; existing installs are not rewritten.
8. `ResolvedProjectLocalConfig` is inferred from Zod; file types are `Pick`s from it (no divergent field types).
9. Merge exists only in `readProjectLocalConfig`; lump-default overlay exists only in `applyLumpConfigDefaults`.
10. DOCS and editor JSON schemas match the contracts above.
11. Unit/e2e coverage above is green; outdated fixtures that assumed primary-only-on-local are updated.
