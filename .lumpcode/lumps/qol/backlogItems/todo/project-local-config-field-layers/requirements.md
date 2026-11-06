# Requirements: one field-layer table for project.json and local.json

| Field | Value |
| --- | --- |
| **Backlog** | `project-local-config-field-layers` · priority **6** · type **refactor** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `@lumpcode/cli` (`utils/projectLocalConfigSchema`, `utils/readProjectLocalConfig`, `types/ProjectJsonConfig.ts`, `types/LocalJsonConfig.ts`). `@lumpcode/core`, `@lumpcode/recipes`, `cli-types`, `cli-utils`, and the JSON schema files' content unchanged. |

## Problem statement and motivation

Which file a field may live in (`.lumpcode/project.json`, `.lumpcode/local.json`, or both with local winning) is written down five times in `packages/apps/cli`:

1. `projectJsonConfigSchema` and `localJsonConfigSchema` in `utils/projectLocalConfigSchema/main.ts` spread `sharedPrimaryFields`, `sharedLumpDefaultFields`, and `sharedRefreshCommandField` by hand.
2. `resolvedProjectLocalConfigSchema` in the same file repeats every field.
3. `SHARED_KEYS` in `utils/readProjectLocalConfig/main.ts` lists the shared keys again, and `mergeProjectAndLocalConfig` copies each local-only key with its own `if`.
4. `ProjectJsonConfig` and `LocalJsonConfig` (`types/`) are hand-written `Pick` lists.
5. `src/schemas/projectConfig.schema.json` and `localConfig.schema.json` list the properties again, with no test tying them to the Zod schemas.

Adding `refreshCommand` touched all five, plus four new merge tests (M13–M16). A field added to the Zod schema but missed in `SHARED_KEYS` passes file validation and is then silently dropped by the merge.

## Goals

1. One table in `utils/projectLocalConfigSchema` says, for every field, which layer owns it and what its Zod schema is.
2. The three Zod schemas, the merge, the key lists, and the `ProjectJsonConfig` / `LocalJsonConfig` types are derived from that table.
3. Merge tests run over the table, so a new shared field gets local-wins, project-only, and local-only coverage without new hand-written cases.
4. A test fails when the JSON schema files list different properties than the table.
5. No change to what either file accepts, to merge results, or to error messages from `readProjectJson`, `readLocalConfig`, and `readProjectLocalConfig`.

## Non-goals

- Changing merge semantics, defaults, or which layer owns any field.
- Generating the JSON schema files from Zod. They stay hand-written; a test only checks their property lists.
- Touching lump-level overlay (`lump > local > project` for `command`, `maximumNumberOfConcurrentBranches`, `keepHistory`, `writeTranscripts`) in `jsConfigToRunLumpInput` or elsewhere.
- Daemon file config (`daemonConfig.schema.json`, `daemonConfigFileSchema`).
- Docs changes. Operator-visible behavior does not change.

## User stories / use cases

1. As a contributor adding a `local.json`-only field — I add one table row and one JSON schema property, and the merge, types, and tests follow.
2. As a contributor adding a shared field — I add one row and one test sample, and get local-wins / project-only / local-only coverage for free.
3. As a reviewer — I check one table to see where a field may live.

## Proposed behavior and UX

### Field layers (current fields, unchanged)

| Layer | Fields | Merge |
| --- | --- | --- |
| `project` | `projectName` (required in `project.json`) | From `project.json` |
| `local` | `mode` (required in `local.json`), `workspaceStrategy`, `disabled`, `maxParallelRun`, `verbose`, `logRetention` | From `local.json`; `workspaceStrategy` defaults to `checkout` |
| `shared` | `primaryBranch`, `primaryBranches`, `projectBaseBranch`, `command`, `maximumNumberOfConcurrentBranches`, `keepHistory`, `writeTranscripts`, `refreshCommand` | `local.json` value when defined, else `project.json` value, else absent |

A key placed in the wrong file still fails strict validation of that file, with today's message.

### Contracts (owner: `utils/projectLocalConfigSchema`)

The table and everything derived from it live in `utils/projectLocalConfigSchema/` (a sibling file such as `fieldLayers.ts` in that folder is fine; re-export from `main.ts`/`index.ts`). Nothing outside this module lists field names by layer.

- `projectLocalConfigFields`: a const table keyed by field name. Each entry has `layer: 'project' | 'local' | 'shared'`, the field's Zod schema (today's schema and messages, including the custom `maxParallelRun`, `logRetention`, `primaryBranches`, and `command` refinements), and whether the field is required in its file. Container shape is free.
- Derived key-union types: `ProjectJsonKey` (project + shared), `LocalJsonKey` (local + shared), `SharedProjectLocalKey`.
- Derived runtime key lists: shared keys and local-only keys, typed with those unions.
- `projectJsonConfigSchema`, `localJsonConfigSchema`: built from the table, still wrapped in `ignoredJsonSchemaKey(... .strict())`. Same exports, same names.
- `resolvedProjectLocalConfigSchema`: built from the table with `workspaceStrategy` required, keeping today's `superRefine` primary-source check and message.
- `ResolvedProjectLocalConfig` stays `z.infer` of the resolved schema.

`types/ProjectJsonConfig.ts` and `types/LocalJsonConfig.ts` become `Pick<ResolvedProjectLocalConfig, ProjectJsonKey>` and `Pick<ResolvedProjectLocalConfig, LocalJsonKey>`. `ProjectConfig` and `LocalConfig` aliases stay.

`mergeProjectAndLocalConfig({ project, local })` keeps its signature and result. It loops over the derived key lists instead of naming fields; `SHARED_KEYS` in `readProjectLocalConfig/main.ts` is deleted. `projectName` from project, `mode` from local, and the `workspaceStrategy` default stay explicit because they are not plain copies.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/utils/projectLocalConfigSchema/` | Add the field table; rebuild the three schemas, key unions, and key lists from it. Remove `sharedPrimaryFields`, `sharedLumpDefaultFields`, `sharedRefreshCommandField`, `logRetentionField` as separate spreads (they may stay as table entries' values) |
| 2 | `packages/apps/cli/src/types/ProjectJsonConfig.ts`, `LocalJsonConfig.ts` | `Pick` with the derived key unions |
| 3 | `packages/apps/cli/src/utils/readProjectLocalConfig/main.ts` | Drop `SHARED_KEYS` and per-field `if`s; merge from the derived lists |
| 4 | Tests | Rows below |

`readProjectJson` and `readLocalConfig` keep importing the file schemas by name; they do not change.

## Testing strategy

| Level | What | Where |
| --- | --- | --- |
| Unit (parameterized) | For every shared key, from a test sample table typed `Record<SharedProjectLocalKey, { project: value; local: value }>` (a new shared key without a sample is a type error): local wins when both set; project value when only project sets it; local value when only local sets it | `utils/readProjectLocalConfig/unit.test.ts` |
| Unit (parameterized) | For every local-only key: a valid sample in `local.json` survives the merge; the same key in `project.json` fails `readProjectJson` | same file, or `utils/readProjectJson/unit.test.ts` |
| Unit | `projectName` in `local.json` fails `readLocalConfig` | `utils/readLocalConfig/unit.test.ts` |
| Unit | Drift: `properties` keys of `src/schemas/projectConfig.schema.json` (minus `$schema`) equal project + shared keys, and `required` equals the required project keys; same for `localConfig.schema.json` with local + shared keys | `utils/projectLocalConfigSchema/unit.test.ts` (new) |
| Existing | Remove M13, M14, M15 (and M1, M2, M3, M7 if the parameterized suite covers them exactly). Keep M4, M5, M6, M8, M9, M9b, M10, M11, M12, M16 and T1–T3 unchanged and green | `utils/readProjectLocalConfig/unit.test.ts` |
| Existing | `readProjectJson`, `readLocalConfig`, `getProjectName` tests stay green with unchanged expected messages | their `unit.test.ts` |

## Acceptance criteria

1. Every field name in the project/local layers appears in exactly one runtime table in `utils/projectLocalConfigSchema`; `SHARED_KEYS` and the hand-written `Pick` field lists are gone.
2. `project.json` and `local.json` accept and reject exactly what they did before, with the same error messages.
3. `mergeProjectAndLocalConfig` returns the same result as before for every existing test.
4. Adding a shared field without a test sample fails type-checking of the merge tests.
5. Changing the table without updating the matching JSON schema file fails the drift test.
6. `npm run build -w=@lumpcode/cli` and `npm run test -w=@lumpcode/cli` pass.
