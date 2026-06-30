# Lump configuration (`config.json` / `config.js` / `config.ts`)

Each lump lives under:

```text
.lumpcode/lumps/<lumpName>/
├── config.json          # JSON config (recommended for beginners)
│   or config.js         # ESM default export (dynamic logic)
│   or config.ts         # TypeScript default export (typed dynamic logic)
├── contextStatusRecord.json   # auto-maintained status cache
├── history/                   # optional per-context prompt run logs (when keepHistory is true)
└── … templates, prompt files, hook modules …
```

Preview a lump before running: `lumpcode lump-plan <lumpName>` (see [commands.md](./commands.md#ref-cmd-lump-plan)).

## Required pieces

Every runnable lump has **two required parts**:

1. **Exactly one context source** — mutually exclusive in the JSON schema:

   | Field | Form | Purpose |
   |-------|------|---------|
   | `contextListJson` | [JSON reference](#field-forms-conventions) (`Record<string,string>`) | Declarative templates expanded by scanning the tree |
   | `getContextListFn` | [Function reference](#field-forms-conventions) | Fully custom context list |
   | `contextMatchFn` | [Function reference](#field-forms-conventions) | Per-file scan → grouped contexts |

2. **Exactly one prompt definition**:

   | Field | Purpose |
   |-------|---------|
   | `prompt` | Single prompt step. Object (full item), or string shorthand (treated as inline `promptTemplate` text — **not** a file path; use `promptFn` to load from disk) |
   | `steps` | Ordered list of steps (mix objects, strings, or dynamic functions — see [advanced-config.md](./advanced-config.md#dynamic-steps)) |

Minimal shape:

```json
{
  "contextListJson": { "FILE": "src/{NAME}.ts" },
  "prompt": {
    "promptTemplate": "Improve types in @{FILE}",
    "command": "copilot"
  }
}
```

The base branch comes from **`.lumpcode/local.json`** (`discoveryBranch` or the first entry of `discoveryBranches`) by default — set `baseBranch` here only when this specific lump should run against a different branch. Workspace setup (in-place vs. on a copy) is also per machine, configured in `.lumpcode/local.json.mode` — see [local-config.md](./local-config.md).

Everything else (`command` at top level when using shorthand strings, hooks, etc.) is optional — see [Optional top-level fields](#optional-top-level-fields).

## Runtime: which files actually load?

- The CLI loads **`config.json`**, **`config.js`**, or **`config.ts`**. When more than one exists, precedence is **`config.ts` → `config.js` → `config.json`** (TypeScript and JavaScript configs are strictly more capable; use JSON-only when you want a static lump without dynamic hooks).
- **`lump-create`** scaffolds `config.json`, `config.js`, or `config.ts` (`--config json`, `--config js`, or `--config ts`; default `json`).

### TypeScript modules

Lumpcode transpiles **`.ts`** lump config, hook modules, and project/global command modules before loading them. Shipped **presets** under `~/.lumpcode/commands/presets/` stay **`.js` only**.

| What | `.ts` support |
| ---- | ------------- |
| Lump config | `config.ts` (highest precedence when present) |
| Hook `*Fn` file paths | `.ts` or `.js` (default export) |
| `.lumpcode/commands/<name>` | `.ts` before `.js` (project-local, then global) |
| Presets (`cursor`, `copilot`, …) | `.js` only |

Transpile output is cached under **`.lumpcode/.cache/transpile/`** (gitignored). `project-setup` adds that path to `.gitignore`; the CLI also appends it the first time a `.ts` module is transpiled in a project that lacks the entry.

Use [`@lumpcode/cli-types`](https://www.npmjs.com/package/@lumpcode/cli-types) with **`defineConfig`** in `config.ts` or `config.js` for editor hints. See [Typed config (optional)](#typed-config-optional).

## Field forms (conventions)

Two forms appear repeatedly in the field tables below. Each is defined here once and referenced by name throughout the docs.

- **Function reference** — used for every field whose name ends with `Fn` (e.g. `branchFn`, `setupFn`, `getContextListFn`, `contextOptionsFn`, `promptFn`, `postCommandExecFn`). Accepts either:
  - an **inline function** — only in `config.js` or `config.ts`, or
  - a **string path** to a `.js` or `.ts` file whose **default export** is the function — works in `config.json`, `config.js`, and `config.ts`.

  Relative paths resolve from the lump folder (`.lumpcode/lumps/<lumpName>/`). Modules are loaded with dynamic `import()`.

- **JSON reference** — used by `contextListJson`. Accepts either:
  - an **inline JSON object**, or
  - a **string path** to a JSON file with the same shape

### Command names

`command` fields (top-level and per-prompt-item) are **not** function references. They hold the **registered name** of a command module:

- **String** (e.g. `"cursor"`, `"copilot"`, `"aider"`, `"my-agent"`) — resolved against `commands/<name>.ts`, then `commands/<name>.js` under the project (`.lumpcode/commands/`), then the same extensions under the global config folder (`~/.lumpcode/commands/`), then shipped presets (`~/.lumpcode/commands/presets/*.js`). Project-local wins over global override; global wins over preset. **`cursor`** and **`copilot`** are built-in preset names (require `cursor-agent` / `copilot` on `PATH`).
- **Inline function** (`config.js` or `config.ts` only) — a `CommandFn` used directly without registry lookup.

Pass agent flags inside the command module's exported `command` function (`executable` + `args`), not in the `command` string. See [advanced-config.md](./advanced-config.md#custom-agent-commands).

## Prompt template syntax

In `promptTemplate` (and string shorthand prompts), the engine substitutes **only** braced placeholders like this:

- **`{VAR}`** → literal string value of `context.variables.VAR`

`VAR` must match a key from `contextListJson` (or a `variables` key returned by `getContextListFn` / `contextMatchFn`).

## Optional top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `baseBranch` | string | Override the default execution branch for this lump (`discoveryBranch` on the lump, then primary discovery branch from `local.json`). Set when this lump should branch off something other than the project-wide default (e.g. a long-lived release branch). |
| `command` | [Command name](#command-names) | Default agent command for all prompt items that don’t set their own `command` |
| `branchFn` | [Function reference](#field-forms-conventions) | Custom branch naming; default is `lump/<lumpName>/<contextNames…>` |
| `disabled` | boolean | When `true`, the background daemon skips this lump (`lumpcode start`); `run` still executes if invoked manually |
| `maximumNumberOfConcurrentBranches` | number | If set (≥ 0), `run` / daemon tick **skips** when open `lump/<lumpName>/*` branches on `origin` ≥ limit (local-only branches are not counted) |
| `numberOfContextsPerBranch` | number | How many contexts share one branch (default `1`) |
| `lumpVariables` | object | Arbitrary JSON passed into hooks and prompt functions as `lumpVariables` |
| `verbose` | boolean | Extra engine operational logging (`verbose` level). Also enabled for an invocation when you pass **`lumpcode run … --verbose`** or **`lumpcode start --verbose`** (OR-merge with this field) |
| `registerCommands` | string[] | Pre-load command modules (`.lumpcode/commands/<name>.ts` or `.js`) before resolving dynamic `steps` |
| `setupFn` / `teardownFn` | [Function reference](#field-forms-conventions) | Per-context lifecycle hooks |
| `contextOptionsFn` | [Function reference](#field-forms-conventions) | **Only with `contextListJson`:** set per-context `options` (`priority`, `dependsOnContexts`) after template expansion. See [contextOptionsFn](#contextoptionsfn-only-with-contextlistjson) and [Context ordering](#context-ordering-and-cross-lump-dependencies) |
| `keepHistory` | boolean | When `true`, append one YAML mapping per prompt step (after the agent command) to `.lumpcode/lumps/<lumpName>/history/<contextName>.yaml` |

Workspace preparation (fetch/pull/branch) is generated for you from `local.json` and the resolved `baseBranch`—there are no `workspaceSetup`, `setupWorkspaceFn`, or `teardownWorkspaceFn` knobs.

### Commit messages

The CLI **always** uses this git commit subject for each context:

```text
LUMP: <lumpName> - <contextName>
```

This format is fixed (not configurable) so that `clean`, `context-status`, and remote status detection stay in sync.

## `contextListJson`

### Inline object

```json
"contextListJson": {
  "FILE": "packages/{PKG}/src/index.ts"
}
```

Each **key** becomes a **variable** name inside each generated context. Values are **path templates** containing:

- **`{PLACEHOLDER}`** — Captures a path segment from the real file tree; all placeholders in one template row must match the **same** file path for a row to contribute to a context.
- **`$modifier{PLACEHOLDER}`** — Same capture, but the on-disk text must equal `modifier(extractedPlaceholderValue)` (used for file naming conventions).

Default modifiers shipped with the template expander:

| Token | Effect |
|-------|--------|
| `$upperFirst` | `UpperFirst` |
| `$camel` | `camelCase` |
| `$kebab` | `kebab-case` |
| `$snake` | `snake_case` |
| `$lower` | `lowercase` |
| `$pascal` | `PascalCase` |

The **context name** is derived by concatenating every captured placeholder tuples with `-` between parts. In most cases, you will use only one placeholder.

### External JSON file

Pass `contextListJson` as a **JSON reference** path (a [JSON reference](#field-forms-conventions) string) instead of an inline object. The file must contain a JSON object of string templates.

Use plain relative paths in templates—**prefer patterns without a leading `./`** (e.g. `"src/{NAME}.ts"`, not `"./src/{NAME}.ts"`).

### `contextOptionsFn` (only with `contextListJson`)

`contextListJson` alone builds `name` and `variables` only. To add **`options`** (see [types.md](./types.md#context) — `priority`, `dependsOnContexts`) to each context, set top-level **`contextOptionsFn`** as a [function reference](#field-forms-conventions).

The function receives each context **before** `options` is set and may return a `Context['options']` object to merge, or `null` / `undefined` to return no options. Shape: [types.md](./types.md#contextoptionsfn).

`contextOptionsFn` is **not** read when the context source is `getContextListFn` or `contextMatchFn` (those already attach `options` on the returned data).

### Context ordering and cross-lump dependencies

Set **`options.priority`** and **`options.dependsOnContexts`** on each context (via `contextOptionsFn`, `getContextListFn`, or `contextMatchFn` → `contextOptions`).

| Field | Behavior |
| ----- | -------- |
| `priority` | Lower number runs sooner among contexts that pass dependency checks. |
| `dependsOnContexts` | Every listed dependency must be **`finished`** before this context runs. |

Each `dependsOnContexts` entry is either a context **`name` in this lump**, or **`<otherLumpName>/<contextName>`** to wait on a context from another lump in the same project. Lumpcode resolves cross-lump refs using that lump’s marker commit (`LUMP: <otherLumpName> - <contextName>`) on the remote — same git repo, shared integration branch / merge workflow.

Context **`name`** values must not contain `/`; use the slash form only in `dependsOnContexts`. Ticket-queue (same lump): [examples.md § 2](./examples.md#2-feature-ticket-queue--strict-dependency-order). Cross-lump pipeline: [examples.md § 7](./examples.md#7-cross-lump-dependency--run-after-another-lump-finishes).

### `getContextListFn` and `contextMatchFn`

Both are [function references](#field-forms-conventions). Shapes: [types.md](./types.md). Examples: [advanced-config.md](./advanced-config.md). **`contextMatchFn`** is invoked once per scanned path with `codeBasePath` (the current entry), `codeBasePaths` (the full list for that run), and `lumpVariables`. Matches that share a `contextName` are merged into one context (see [types.md § ContextMatchFn](./types.md#contextmatchfn)); use a distinct `contextName` per unit of work when you want separate contexts. Put per-context `priority` and `dependsOnContexts` on each `Context` returned from **`getContextListFn`**, or in **`contextOptions`** on **`contextMatchFn`** results.

## Prompt configuration

### Shorthand `prompt`

`prompt` may be:

1. **String** — Treated as inline **`promptTemplate`** text (with `{VAR}` substitution). This string is **never** read as a file path—use a [function reference](#field-forms-conventions) on `promptFn` to load from disk.
2. **Object** — `LumpJsonConfigStep` fields below.

### `steps` array

Each element may be:

- **String** — Same as shorthand template above.
- **Object** — Full `LumpJsonConfigStep`.
- **Function** (`config.js` or `config.ts` only) — A function-form item that returns more items dynamically (see [advanced-config.md](./advanced-config.md#dynamic-steps)).

### Per-item fields (`LumpJsonConfigStep`)

| Field | Type | Description |
|-------|------|-------------|
| `promptTemplate` | string | Optional. Inline template text — same `{VAR}` rules as [Prompt template syntax](#prompt-template-syntax). Mutually exclusive with `promptFn` on the same step. When omitted, the command receives an empty prompt string. |
| `promptFn` | [Function reference](#field-forms-conventions) | Optional. Returns prompt text. Mutually exclusive with `promptTemplate` on the same step. |
| `command` | [Command name](#command-names) | Required on each step unless overridden inline via `commandFn` in `config.js` / `config.ts`; inherits top-level `command` when omitted. |
| `postCommandExecFn` | [Function reference](#field-forms-conventions) | Hook called after the agent finishes |
| `stepVariables` | object | JSON-serializable bag passed to promptFn/command/postCommandExecFn hooks |
| `timeoutMillis` | number | Millis cap for the agent process |

## Prompt run history (`keepHistory`)

By default, Lumpcode does **not** write prompt or agent output to disk. Set **`"keepHistory": true`** on a lump (in `config.json`, `config.js`, or `config.ts`) to record each prompt step locally.

### File layout

When enabled, after each successful agent command the engine appends one entry to:

```text
.lumpcode/lumps/<lumpName>/history/<contextName>.yaml
```

There is **one file per context** — all prompt steps for that context are in the same YAML sequence (array).

### Entry shape

Each sequence item matches the input passed to **`postCommandExecFn`** (see [types.md](./types.md) and the [core README](https://github.com/lumpcode/lumpcode/blob/main/packages/core/README.md)):

| Field | Description |
|-------|-------------|
| `commandResult` | Agent stdout/stderr combined (can be large; may contain secrets) |
| `commandSucceeded` | `true` when the subprocess succeeded or was skipped; `false` when it failed but `continueOnError` allowed the hook to run |
| `context` | The context object (`name`, `variables`, optional `options`) |
| `prompt` | Resolved prompt string sent to the agent |
| `stepIndex` | Step index at the root, or a path like `[1, 0]` for nested dynamic items |
| `contextRunState` | Mutable bag for this context run |
| `lumpVariables` | Lump-level variables from config |
| `stepVariables` | Per-item variables, if set |
| `projectRoot` | Absolute project root path |

History is written **before** an optional `postCommandExecFn` on the same prompt item runs.

### Git and privacy

`lumpcode project-setup` appends **`.lumpcode/**/history/`** and **`.lumpcode/.cache/`** to `.gitignore` so run logs and transpile cache stay local. History is intended for debugging and inspection on your machine—not for sharing via git.

### Example

```json
{
  "contextListJson": { "FILE": "src/{NAME}.ts" },
  "keepHistory": true,
  "prompt": {
    "promptTemplate": "Improve @{FILE}",
    "command": "copilot"
  }
}
```

A history file for context `button` might look like:

```yaml
- commandSucceeded: true
  prompt: |
    Refactor src/Button.tsx for accessibility.
    Focus on keyboard navigation and ARIA labels.
  commandResult: |
    Updated Button.tsx: added role="button", tabIndex, and onKeyDown handler.
  context:
    name: button
    variables:
      FILE: src/Button.tsx
  stepIndex: 0
  contextRunState:
    copilotSetup:
      setupChatId: a1b2c3d4-...
  lumpVariables: {}
  projectRoot: /Users/me/my-app
```

## `contextStatusRecord.json`

Auto-maintained cache of the context statuses under each lump folder. Keys are **context names**; each value:

```json
{
  "status": "toDo | branchPushed | finished",
  "contextName": "same-as-key",
  "branchName": "lump/myLump/foo-bar or empty",
  "commitMessage": "LUMP: myLump - foo-bar"
}
```

Status semantics: [concepts.md#core-terms](./concepts.md#core-terms). Refresh with `lumpcode lump-status` or automatically after `run`.

## Typed config (optional)

Install [`@lumpcode/cli-types`](https://www.npmjs.com/package/@lumpcode/cli-types) as a dev dependency and use its `defineConfig` (and other `define*` helpers) so **`config.ts`** or **`config.js`** gets accurate TypeScript hints for every hook and field:

```bash
npm install --save-dev @lumpcode/cli-types
```

```ts
import { defineConfig } from '@lumpcode/cli-types';

export default defineConfig({
  contextListJson: { FILE: 'src/{NAME}.ts' },
  prompt: { promptTemplate: 'Fix @{FILE}', command: 'copilot' },
});
```

## Related documentation

- [concepts.md](./concepts.md) — Status lifecycle, pre-flight, daemon overview
- [local-config.md](./local-config.md) — Per-machine `local.json` (`mode`, `discoveryBranch`)
- [advanced-config.md](./advanced-config.md) — Hooks, dynamic prompts, custom commands
- [types.md](./types.md) — Callback signatures
- [commands.md](./commands.md) — `run`, `daemon-status`, `lump-status`, `context-status`
