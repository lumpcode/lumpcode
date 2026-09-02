---
title: Lump config
description: Every lump is config.ts, config.js, or config.json in .lumpcode/lumps/<name>/. Two fields are required. The rest are overrides.
---

Preview with `lumpcode lump-plan <lumpName>` before you spend tokens.

## Files

```text
.lumpcode/lumps/<lumpName>/
├── config.ts                 # preferred for real campaigns
│   or config.js
│   or config.json            # static only
├── contextStatusRecord.json  # cache, refreshed from git
└── history/                  # optional, gitignored, keepHistory
```

Load precedence: **`config.ts` > `config.js` > `config.json`**. `lump-create --config ts|js|json` scaffolds one of them (default JSON).

`.ts` lump config, hooks, and project/global command modules are transpiled and cached under `.lumpcode/.cache/transpile/` (gitignored). Shipped presets stay `.js`.

JSON Schema for editors: `https://lumpcode.com/schemas/lumpConfig.schema.json` (`$schema` in JSON configs).

## Required

Exactly one [context source](/docs/author/contexts) and exactly one [prompt definition](/docs/author/prompts). Minimal shape is on [write a lump](/docs/author/write-a-lump).

## Field forms

**Function reference** (`*Fn` fields): an inline function in `config.js` / `config.ts`, or a string path to a `.js` / `.ts` file whose default export is the function. Relative paths resolve from the lump folder.

**JSON reference** (`contextListJson`): an inline object, or a string path to a JSON file.

**`command`**: a registered tag (`cursor`, `copilot`, `claude-code`, `opencode`, `codex`, or your module name) **or** a lump-relative `.ts` / `.js` path with no whitespace. Not a shell snippet. [Agents](/docs/author/agents).

## Optional top-level fields

| Field | What it does |
| --- | --- |
| `command` | Default agent for steps that omit their own. |
| `baseBranch` | Exact execution branch. Omit to use the concrete discovery / primary branch. JS/TS may use a function. |
| `discoveryBranch` / `discoveryBranches` | Where a dedicated worker finds this lump. Mutually exclusive. Globs allowed. Ignored for `run` in shared mode. |
| `disabled` | Soft-skip on `run` and on the worker (exit 0). Boolean, function, or module path. |
| `maximumNumberOfConcurrentBranches` | Skip the run when that many `lump/<name>/*` branches already exist on origin. |
| `numberOfContextsPerBranch` | Default `1`. Raise it to group small diffs. |
| `lumpVariables` | Bag for hooks and preset options (`model`, `agentPermissions`). |
| `verbose` | Extra engine logs. Also on with `lumpcode run --verbose`. |
| `keepHistory` | Write prompt/output YAML per context. Gitignored. |
| `registerCommands` | Extra command tags that appear only inside dynamic `steps`. |
| `branchFn` | Custom work-branch name. Default `lump/<lumpName>/<contexts…>`. |
| `setupFn` / `teardownFn` | Per-context hooks. Teardown always runs; failures are logged and do not block git. |
| `postSetupWorkspaceFn` / `Command` | After generated git setup, in the branch workspace (`npm ci`). Not under the git lock; do not put git mutations here. Mutually exclusive pairs. |
| `postTeardownWorkspaceFn` / `Command` | Before generated teardown. Same rules. `openPrPostTeardown` hooks in here. |
| `contextOptionsFn` | Only with `contextListJson`: attach `priority` / `dependsOnContexts`. |

There are **no** `setupWorkspaceFn` / `teardownWorkspaceFn` knobs. The CLI generates git setup from `local.json` and `baseBranch`. `lump-plan` skips post-setup / post-teardown commands.

### Commit message

Always:

```text
LUMP: <lumpName> - <contextName>
```

Not configurable, so `clean` and status stay aligned. Keep the string when squashing.

## Defaults from project / local

`command`, `maximumNumberOfConcurrentBranches`, `keepHistory`: **lump > local.json > project.json**. `verbose` is local-only (plus the CLI flag). A lump value of `false` or `0` is kept; only `undefined` inherits.

## Status cache

`contextStatusRecord.json` is a cache of `toDo` | `branchPushed` | `finished`. Source of truth is still remote git. Refresh with `lumpcode lump-status` or automatically after `run`.

Typed configs: `defineConfig` from `@lumpcode/cli-utils`. Hook signatures and dynamic steps: [advanced](/docs/config/advanced).
