# Requirements: `setup` js/ts stubs

| Field | Value |
| --- | --- |
| **Backlog** | `setup-js-ts-stubs` · priority **2** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `setup-first-pr-drive` |
| **Packages** | Primary: `@lumpcode/cli` (`commands/setup`). Docs: get-started / First PR mention js/ts as a format choice. Core / recipes / `cli-types` / `cli-utils` unchanged (install them; do not change their APIs). |

## Problem statement and motivation

The first-run drive always writes JSON. JS/TS authors need `contextMatchFn` and resolvable `@lumpcode/cli-utils` + `@lumpcode/recipes` on the project.

1. JSON-only stub cannot scan a suffix of files.
2. A global CLI does not provide those packages to a dedicated clone.

## Goals

1. Before writing a first lump, ask `json` \| `js` \| `ts`.
2. js/ts: confirm `npm install @lumpcode/cli-utils @lumpcode/recipes` (default yes). Failure warns and continues.
3. js/ts stub exports `contextMatchFn` + `prompt` so `lump-plan` lists suffix files with sanitized names.

## Non-goals

- Writing those packages into `package.json` on JSON format.
- `defineConfig` / recipe imports in the stub.
- Publishing `contextNameFromPath` as a CLI util.
- Scaffolding a custom command module.
- Changing resume skip rules (existing lump still skips this write).

## User stories / use cases

1. As a JS/TS author — I pick `ts`, accept the npm install, get a `contextMatchFn` stub over `*.js` (or a chosen suffix), so plan lists those files.

## Proposed behavior and UX

Insert before `chooseCommand` when no lump config exists (skipped on resume if a lump config is already on disk).

### `configFormat`

Ask `json` \| `js` \| `ts`. JSON write stays the first-run stub.

### `installAuthoringPkgs` (js or ts only)

Confirm, default yes. Yes → `npm install @lumpcode/cli-utils @lumpcode/recipes` at `projectRoot` (`dependencies`, registry). No `package.json` → write `{ "name": "<projectName>", "private": true }` first. Failure → warn, continue. JSON format never runs this step.

`commitPush` already allowlists `package.json` and `package-lock.json` when they exist.

### js / ts stub

`export default { contextMatchFn, prompt }`. Prompt: `clean and improve the code in @{FILE}`. `prompt.command` is the chosen tag. No `baseBranch`. No `defineConfig` / recipe imports.

| `contextMatchFn` | Rule |
| --- | --- |
| skip | `codeBasePath.isDir` |
| skip | path does not end with suffix (default `.js`) |
| return | `{ contextName, filePathVariableName: 'FILE' }` |

If no scanned file has suffix `.js`, ask for another suffix (e.g. `.ts`) before writing.

```ts
function contextNameFromPath(filePath: string): string
// strip final extension, then replace each run of chars outside [a-zA-Z0-9_-] with '-'
```

This function lives **in the generated lump file**, not as a published CLI util. It is not the exact-path expander rule.

## Technical approach

| Step | Where | Contract |
| --- | --- | --- |
| 1 | `commands/setup/` | Format prompt. npm install step. js/ts stub writer. JSON path unchanged. |
| 2 | get-started / First PR | Mention js/ts as an optional format (JSON remains the default first-run story). |

## Testing strategy

| Level | Host | Expect |
| --- | --- | --- |
| Unit | `commands/setup/` | js/ts writes `contextMatchFn` stub; suffix ask when no `.js`; npm failure warns and continues; JSON never runs npm install. Resume with an existing lump still skips the write. |

## Docs updates

| Document | Change |
| --- | --- |
| First PR / `get-started.md` | Format choice exists; JSON is the simple path; js/ts installs authoring packages. |

## Acceptance criteria

1. js/ts stub matches suffix files with sanitized names; default suffix `.js`; ask when none match.
2. Authoring-pkg default yes; failure does not abort the drive.
3. JSON format does not write `@lumpcode/cli-utils` / `@lumpcode/recipes` into `package.json`.
4. `contextNameFromPath` is only in the generated file. No second published sanitizer.
