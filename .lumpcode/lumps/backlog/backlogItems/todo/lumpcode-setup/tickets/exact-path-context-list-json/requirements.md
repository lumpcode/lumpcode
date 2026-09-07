# Requirements: Exact-path `contextListJson`

| Field | Value |
| --- | --- |
| **Backlog** | `exact-path-context-list-json` · priority **0** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `@lumpcode/cli` (`makeGetContextListFnFromTemplate` + `DOCS/lump-config.md`). Website lump-config page if it documents `contextListJson`. Core / recipes / `cli-types` / `cli-utils` unchanged. |

## Problem statement and motivation

`extractPattern` returns `{}` when the template has no `{placeholder}` / `$modifier{…}`. `makeGetContextListFnFromTemplate` then emits no context. Docs smoke (`README.md`) and the coming `setup` JSON stub need a literal path to match that file.

1. `{ "FILE": "README.md" }` plans to zero contexts.
2. Only `{NAME}.md`-style templates work.

## Goals

1. A template value with no placeholder matches the normalized scanned path exactly and emits one context.
2. Placeholder templates (`{NAME}.md`, `$kebabCase{…}`) stay unchanged.
3. `lump-config.md` documents the exact-path rule.

## Non-goals

- Glob `*` / `{FILE}` / `{FILE}.js` in JSON `contextListJson`.
- Changing `extractPattern`.
- The js/ts `contextNameFromPath` sanitizer (generated stub; different rule).
- The `setup` command.

## User stories / use cases

1. As an author — I set `contextListJson.FILE` to `README.md`, so `lump-plan --contexts` lists one context named `README`.
2. As an author — I keep `{COMPONENT}.tsx` templates, so those lumps still expand as today.

## Proposed behavior and UX

Owner: `makeGetContextListFnFromTemplate` only.

Path normalize (already used): strip a leading `./` or `.\`. Dirs still get a trailing `/` before match.

**Has placeholder** (`{…}` or `$modifier{…}` in the template value): existing `extractPattern` path. Unchanged.

**No placeholder:** if the normalized scanned path equals the normalized template value, emit one context:

| Field | Value |
| --- | --- |
| `variables[key]` | the normalized scanned path |
| `name` | exact-path context name |

**Exact-path context name:** basename of the path, then strip the final `.[^/.]+`. Must match `^[a-zA-Z0-9_-]+$` (`validateContextListNames`). If the derived name is illegal, do not emit that context (same as leftover files: no context). `{NAME}.md` is not this rule.

No match → no context (same as today for leftover files).

Examples:

| Template | Scanned file | Context name |
| --- | --- | --- |
| `README.md` | `README.md` | `README` |
| `docs/api.md` | `docs/api.md` | `api` |
| `README.md` | `src/README.md` | (none) |
| `{NAME}.md` | `README.md` | `README` (existing expander) |

## Technical approach

| Step | Where | Contract |
| --- | --- | --- |
| 1 | `makeGetContextListFnFromTemplate` | After normalize, if the template value has no `{` / `$modifier{` tokens, exact-equality match + name rule above. Else keep `extractPattern`. |
| 2 | `DOCS/lump-config.md` (+ website twin if it documents this field) | No placeholder = exact relative path. |

Do not add a second matcher in `setup` or `extractPattern`.

## Testing strategy

| Level | Host | Expect |
| --- | --- | --- |
| Unit | `makeGetContextListFnFromTemplate/unit.test.ts` | `README.md` → `README`; nested legal basename; illegal derived name emits nothing; `{NAME}.md` unchanged. |
| E2E | Optional | Existing harness: JSON exact-path `README.md` visible to `lump-plan --contexts`. No live agent. |

Existing placeholder fixtures in that suite must stay green.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/lump-config.md` | Exact-path `contextListJson` (no placeholder = exact relative path). |
| Website lump-config page | Same if it already documents `contextListJson`. |

## Acceptance criteria

1. `{ FILE: "README.md" }` against a repo-root `README.md` yields one context `README` with `variables.FILE === "README.md"`.
2. A nested legal basename (e.g. `docs/api.md` → `api`) matches only that path.
3. An illegal derived name does not appear in the list.
4. `{NAME}.md` (and other placeholder templates) behave as they do today.
5. No second exact-path implementation outside `makeGetContextListFnFromTemplate`.
