---
title: Lump config
description: Every lump is config.ts, config.js, or config.json in .lumpcode/lumps/<name>/. Two fields are required. The rest are overrides.
---

Preview with `lumpcode lump-plan <lumpName>` before you spend tokens.

## Files

```text .lumpcode/lumps/<lumpName>/
.lumpcode/lumps/<lumpName>/
├── config.ts                 # preferred for real campaigns
│   or config.js
│   or config.json            # static only
├── contextStatusRecord.json  # cache, refreshed from git
└── history/                  # optional, gitignored, keepHistory
```

Load precedence: **`config.ts` > `config.js` > `config.json`**. `lump-create --config ts|js|json` scaffolds one of them (default JSON).

`.ts` lump config, hooks, and project/global command modules are transpiled and cached under `.lumpcode/.cache/transpile/` (gitignored). Shipped presets stay `.js`.

| What | `.ts` |
| --- | --- |
| Lump config, `*Fn` paths, `.lumpcode/commands/<name>` | yes (`.ts` before `.js`) |
| Shipped presets | `.js` only |

JSON Schema for editors: `https://lumpcode.com/schemas/lumpConfig.schema.json` (`$schema` in JSON configs).

## Required

Exactly one [context source](/docs/author/contexts) and exactly one [prompt definition](/docs/author/prompts). Minimal shape is on [write a lump](/docs/author/write-a-lump).

## Field forms

**Function reference** (`*Fn` fields): an inline function in `config.js` / `config.ts`, or a string path to a `.js` / `.ts` file whose default export is the function. Relative paths resolve from the lump folder.

```ts config.ts
getContextListFn: './tickets.ts'

getContextListFn() {
  return [{ name: 'readme', variables: { FILE: 'README.md' } }]
}
```

**JSON reference** (`contextListJson`): an inline object, or a string path to a JSON file.

```json config.json
{
  "contextListJson": "./files.json"
}
```

**`command`** (top-level and per step), one of:

- **Tag** — `cursor`, `copilot`, `claude-code`, `opencode`, `codex`, or your module name. Resolved project `.lumpcode/commands/<name>.ts` then `.js`, then the same under `~/.lumpcode/commands/`, then shipped presets (`.js` only).
- **Lump-relative file** — no whitespace, ends in `.ts` or `.js`. Loaded as a command module. `commandName` is the literal string.
- **Inline `CommandFn`** — JS/TS only. Same contract as `commandFn`: return `{ executable, args }` or skip. No registry lookup.

Not a shell snippet. Flags go in `executable` + `args`. [Agents](/docs/author/agents), [Types](/docs/config/types).

```ts config.ts
command: 'cursor'

command: './runAgent.ts'

command: ({ prompt }) => ({ executable: 'my-agent', args: ['-p', prompt] })
```

## Optional top-level fields

| Field | What it does |
| --- | --- |
| `command` | Default agent for steps that omit their own. |
| `baseBranch` | Exact execution branch. Omit to use the concrete discovery / primary branch. JS/TS may use `({ effectiveDiscoveryBranch, contexts }) => string`. |
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

```ts config.ts
import { defineConfig } from '@lumpcode/cli-utils'

export default defineConfig({
  command: 'cursor',
  contextListJson: { FILE: 'src/{NAME}.ts' },
  prompt: { promptTemplate: 'Improve types in @{FILE}.' },
  discoveryBranches: ['dev', 'feature/*'],
  numberOfContextsPerBranch: 1,
  maximumNumberOfConcurrentBranches: 3,
  keepHistory: true,
  disabled: false,
  postSetupWorkspaceCommand: 'npm ci',
})
```

### Commit message

Always:

```text commit
LUMP: <lumpName> - <contextName>
```

Not configurable, so `clean` and status stay aligned. Matched **anywhere in the full message**; `foo` does not match `foo-bar`. Keep the string when squashing.

## Defaults from project / local

`command`, `maximumNumberOfConcurrentBranches`, `keepHistory`: **lump > local.json > project.json**. `verbose` is local-only (plus the CLI flag). A lump value of `false` or `0` is kept; only `undefined` inherits.

## Status cache

`contextStatusRecord.json` is a cache. Source of truth is still remote git. Refresh with `lumpcode lump-status` or automatically after `run`. Each key is a context name:

```json contextStatusRecord.json
{
  "status": "toDo | branchPushed | finished",
  "contextName": "same-as-key",
  "branchName": "lump/myLump/foo or empty",
  "commitMessage": "LUMP: myLump - foo"
}
```

## History

`"keepHistory": true` appends one YAML object per step to `.lumpcode/lumps/<lumpName>/history/<contextName>.yaml` (gitignored). Written after the command, before `postCommandExecFn`. Not written when `commandFn` skips. Fields match that hook: `prompt`, `commandResult`, `commandSucceeded`, `context`, `stepIndex`, `contextRunState`, `lumpVariables`, `stepVariables`, `projectRoot`. Agent output can contain secrets.

```yaml history/foo.yaml
- prompt: Add an explicit return type…
  commandSucceeded: true
  commandResult: …
  stepIndex: 0
```

Typed configs: `defineConfig` from `@lumpcode/cli-utils` (`defineConfig<V, SV>` to refine bags). Signatures: [types](/docs/config/types).
