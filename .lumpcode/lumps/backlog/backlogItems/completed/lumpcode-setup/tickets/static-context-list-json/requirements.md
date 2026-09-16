# Requirements: Static `ContextList` in `contextListJson`

| Field | Value |
| --- | --- |
| **Backlog** | `static-context-list-json` · priority **0** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `@lumpcode/cli` (`LumpJsConfig`, `lumpConfig.schema.json`, `resolveGetContextListFn`, revert exact-path in `makeGetContextListFnFromTemplate`, CLI DOCS). Website contexts / lump / examples / types. Lumpcode skill. Core / recipes unchanged (`ContextList` consumed as-is). `cli-types` re-exports `LumpJsConfig` only. |

Supersedes completed `exact-path-context-list-json`.

## Problem statement and motivation

`contextListJson` was only a path-template map (or a file of that map). A known list (docs smoke, `setup` JSON stub) had no generic JSON form. Exact-path `{ FILE: "README.md" }` inferred a name from the basename and scanned the tree. That is a special case of "I already know the contexts."

1. JSON cannot write a real `ContextList`.
2. No-placeholder template values either plan nothing or use a one-off exact-path matcher.
3. `options` on a static list required `contextOptionsFn`.

## Goals

1. `contextListJson` is `FilePath | ContextList | Record<string, string>`.
2. An array is a literal `ContextList` (no disk check). `[]` and `{}` are empty plans.
3. A non-empty template value without `{…}` / `$modifier{…}` fails at resolve.
4. Exact-path matching is removed.
5. Contract docs and the smoke example use a one-item `ContextList`.

## Non-goals

- Glob `*` in JSON `contextListJson`.
- Changing `extractPattern`.
- The `setup` command (next ticket; stub shape is specified there).
- Early unique-name checks (stay in `validateContextListNames`).
- Nested file paths in the JSON file payload.

## User stories / use cases

1. As an author — I set `contextListJson` to `[{ name: "README", variables: { FILE: "README.md" } }]`, so `lump-plan --contexts` lists one context named `README` even if I do not scan.
2. As an author — I keep `{COMPONENT}.tsx` templates, so those lumps still expand as today.
3. As an author — I write `{ FILE: "README.md" }` and config resolve fails, pointing me at a `ContextList`.

## Proposed behavior and UX

```ts
type ContextListJsonTemplate = Record<string, string>;
type ContextListJsonValue = ContextList | ContextListJsonTemplate;
// LumpJsConfig
contextListJson?: FilePath | ContextListJsonValue;
```

Discriminant (inline and after `readJsonFile`): `string` → file (`ContextListJsonValue` contents, no nested path); `Array.isArray` → `ContextList`; otherwise template map.

**Static list:** return as written. Extra keys on a context or `options` → resolve `Failure`. `contextOptionsFn` is ignored (no `Failure`). Name uniqueness / legality stay `validateContextListNames`.

**Template map:** placeholder scan unchanged. `{}` → empty plan. Any value without `{…}` / `$modifier{…}` → resolve `Failure`.

Owner: `resolveGetContextListFn` + `lumpConfig.schema.json` `$defs.Context`. Revert exact-path in `makeGetContextListFnFromTemplate`. Private parse helper in `jsConfigToRunLumpInput` (not a new util).

## Technical approach

| Step | Where | Contract |
| --- | --- | --- |
| 1 | `LumpJsConfig` | Field type above. |
| 2 | `lumpConfig.schema.json` | `oneOf` string / Context array / template object. `$defs.Context` as agreed (`additionalProperties: false`, name pattern, variable scalars). |
| 3 | `resolveGetContextListFn` | Discriminant + structural parse. Array → `async () => list`. Template → expander (optional `contextOptionsFn`). |
| 4 | `makeGetContextListFnFromTemplate` | No exact-path branch. |
| 5 | Docs / skill / fixtures | Array vs template vs file. Smoke is a one-item list. |

## Testing strategy

| Level | Host | Expect |
| --- | --- | --- |
| Unit | `jsConfigToRunLumpInput/testing/contextList.unit.test.ts` | Inline list; file list; ignore `contextOptionsFn`; `[]` / `{}` empty; no-placeholder `Failure`; extra keys `Failure`. |
| Unit | `validateLumpJsonConfig/unit.test.ts` | Accept list / `[]` / `{}`; reject extra keys and a bare Context object. |
| Unit | `makeGetContextListFnFromTemplate/unit.test.ts` | `{NAME}.md` unchanged; no-placeholder emits nothing (resolve fails first). |
| Unit | Fixtures using `{ NAME: 'README' }` / `{ c1: 'README.md' }` | Become a `ContextList`. |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/lump-config.md` | Array vs template vs file; drop exact-path; no-placeholder → `Failure`. |
| `packages/apps/cli/DOCS/types.md` | Field type; `contextOptionsFn` is template-only. |
| CLI + website examples smoke | One-item `ContextList`. |
| Website `contexts.md` + `lump.md` | Same contract. |
| `lumpConfig.schema.json` | Descriptions / examples. |
| `.agents/skills/lumpcode/SKILL.md` | Static list or path map. |

First PR / get-started / worker stay on `setup-first-pr-drive`.

## Acceptance criteria

1. `[{ name: "README", variables: { FILE: "README.md" } }]` plans to that context with no disk check.
2. `{ FILE: "README.md" }` fails at resolve.
3. `{ FILE: "src/{NAME}.ts" }` still expands.
4. `[]` and `{}` plan zero contexts.
5. Extra keys on a list item fail at resolve.
6. `contextOptionsFn` does not change a static list.
7. No exact-path matcher remains in `makeGetContextListFnFromTemplate`.
