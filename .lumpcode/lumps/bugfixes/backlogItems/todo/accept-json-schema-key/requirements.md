# Requirements: Accept `$schema` on operator JSON configs

| Field | Value |
| --- | --- |
| **Backlog** | `accept-json-schema-key` · priority **2** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `@lumpcode/cli` (Zod parse + published schemas + CLI tests). Website docs in `packages/apps/website`. CLI `DOCS/` aligned with those schemas. `@lumpcode/core` unchanged. Recipe `desc.yml` schemas unchanged. |

## Problem statement and motivation

Website and CLI docs tell operators to put `"$schema": "https://lumpcode.com/schemas/…"` on JSON configs so editors autocomplete. Lumpcode then drops those files: Zod `.strict()` reports `unrecognized_keys` / `$schema`, and the published schemas use `additionalProperties: false` without a `$schema` property (editors that fetch the schema also flag the key they recommend).

1. `discoverDaemonConfigFiles` warns `schema invalid` and drops `.lumpcode/daemons/<id>.json` that match the docs snippet (`/docs/config/daemons`).
2. The same Zod reject hits `.lumpcode/project.json` and `.lumpcode/local.json`.
3. Published `daemonConfig.schema.json`, `projectConfig.schema.json`, and `localConfig.schema.json` contradict the docs.

## Goals

1. Optional `$schema` (string) is valid on every operator JSON file Lumpcode parses or publishes a schema for.
2. `$schema` is editor metadata only: stripped from parse output, hashes, and inferred types.
3. Any other unknown key still fails (same as today).
4. Docs/examples stay honest: the key they show is accepted.

## Non-goals

- Allowing other unknown keys (no `.passthrough()`, no silent `.strip()` of typos).
- Machine-written `~/.lumpcode` JSON (`desired.json`, daemon meta, supervisor files).
- Recipe `desc.yml` schemas (editors use a YAML comment, and those schemas already allow extra keys).
- Writing `$schema` from `project-setup` or other CLI writers.
- URL-format validation of the `$schema` string.
- Changing `resolvedProjectLocalConfigSchema` (merge of already-stripped parses).

## User stories / use cases

1. As an operator — I copy the daemon recipe from `/docs/config/daemons` including `$schema`, so the dedicated worker considers that file instead of dropping it.
2. As an operator — I add `$schema` to `project.json` / `local.json` / lump `config.json` for editor validation, so `run` / `start` / `lump-plan` still load the file.
3. As an editor user — the fetched JSON Schema lists `$schema`, so the recommended key is not an `additionalProperties` error.

## Proposed behavior and UX

`$schema` is optional on these operator files. Value is any string. Absent is fine.

| File | Runtime validator today | After |
| --- | --- | --- |
| `.lumpcode/daemons/<id>.{json,yml,yaml}` | `daemonConfigFileSchema` `.strict()` | Accept `$schema`; parsed `DaemonConfigFile` has no `$schema`; `hashDaemonConfigFile` unchanged vs the same recipe without the key |
| `.lumpcode/project.json` | `projectJsonConfigSchema` `.strict()` | Same strip; `readProjectJson` / `getProjectName` succeed |
| `.lumpcode/local.json` | `localJsonConfigSchema` `.strict()` | Same strip; `readLocalConfig` succeeds |
| `.lumpcode/lumps/<name>/config.json` | Ajv `lumpConfig.schema.json` (`additionalProperties: true`) | Already accepted; declare `$schema` on the schema for editors |

YAML daemon recipes may use a `$schema` key (same Zod schema) or a `# yaml-language-server: $schema=` comment (already ignored).

Unknown keys other than `$schema` still fail with the existing unrecognized-key style.

### Canonical owner

**`ignoredJsonSchemaKey`** — `packages/apps/cli/src/utils/ignoredJsonSchemaKey/` (barrel-export from `utils/index.ts`).

Wraps a Zod object schema (the existing `.strict()` object):

- Input may include optional `$schema: string`.
- Output type is `z.infer<S>` of the wrapped schema (no `$schema`).
- Other extra keys still fail.

`daemonConfigFileSchema`, `projectJsonConfigSchema`, and `localJsonConfigSchema` must use this helper. Do not add a `$schema` field independently on those schemas or on `resolvedProjectLocalConfigSchema`.

### Published JSON Schemas

Add an optional `$schema` string property (editor URL; ignored at runtime) on:

| Schema | Path |
| --- | --- |
| Daemon | `packages/apps/cli/src/schemas/daemonConfig.schema.json` |
| Project | `packages/apps/cli/src/schemas/projectConfig.schema.json` |
| Local | `packages/apps/cli/src/schemas/localConfig.schema.json` |
| Lump JSON | `packages/apps/cli/src/schemas/lumpConfig.schema.json` |

Keep `additionalProperties: false` on daemon/project/local. `$schema` is a listed property, not a reason to open the object.

## Technical approach

1. Add `ignoredJsonSchemaKey` and unit-test wrap behavior (accept + strip `$schema`; reject other extras; output equals the inner schema).
2. Apply it to the three Zod file schemas in `daemonConfigFile` and `projectLocalConfigSchema`.
3. Declare `$schema` on the four published JSON Schemas.
4. Docs: keep the daemon `$schema` example; add `$schema` to website project/local snippets; one line on CLI `DOCS/` project/local/concepts (or daemons) that the key is allowed and ignored. `/docs/config/daemons` “Extra keys fail” stays true (`$schema` is a known key).

## Testing strategy

| Level | What | Where |
| --- | --- | --- |
| Unit | Helper: accept `$schema`, strip it, reject other extras | `ignoredJsonSchemaKey/unit.test.ts` |
| Unit | Daemon parse + hash identical with/without `$schema`; extras still fail | `daemonConfigFile/unit.test.ts` |
| Unit | Discover considers a daemon JSON that includes `$schema` (no schema-invalid warn) | `discoverDaemonConfigFiles/unit.test.ts` |
| Unit | `readLocalConfig` / `readProjectJson` accept `$schema`; existing unknown-key cases stay red | `readLocalConfig/unit.test.ts`, `readProjectJson/unit.test.ts` (and `getProjectName` unknown-key case if it parses the file) |
| Unit | Lump Ajv still accepts `$schema` if a validator test exists | `validateLumpJsonConfig` tests only if present |

No new E2E required.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/website/content/docs/config/daemons.md` | Keep the `$schema` example; do not say extra keys include `$schema` |
| `packages/apps/website/content/docs/config/project.md` | Add `$schema` to the example JSON |
| `packages/apps/website/content/docs/config/local.md` | Add `$schema` to at least one example JSON |
| `packages/apps/cli/DOCS/project-config.md`, `local-config.md`, and the daemon-file note in `concepts.md` | `$schema` allowed, ignored at runtime |
| Published `*.schema.json` descriptions | `$schema` is for editors |

## Acceptance criteria

1. A daemon recipe that matches the website snippet (including `$schema`) is considered by `discoverDaemonConfigFiles` when `discoveryBranch` matches; no `schema invalid` / `unrecognized_keys` warn.
2. `project.json` and `local.json` with `$schema` load; parsed objects have no `$schema` field.
3. Daemon hash with `$schema` equals the same recipe without it.
4. Unknown keys other than `$schema` still fail on daemon, project, and local.
5. The four published JSON Schemas list `$schema` as an optional string.
6. Only `ignoredJsonSchemaKey` implements the accept-and-strip rule; the three file Zod schemas call it; no third copy on the merge schema.
