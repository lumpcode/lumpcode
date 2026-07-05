---
name: create-lump
description: Guide a user through creating a Lumpcode lump (agent loop campaign) in their repo — choose a context source, write the prompt/steps, and validate the config. Use when the user asks to create, scaffold, set up, or configure a lump, a lumpcode config, or a `.lumpcode/lumps/<name>/config` file.
---

# Create a Lump

Help the user author a working **lump** for [Lumpcode](https://github.com/lumpcode/lumpcode). Everything you need to write a valid config is below, with links to the official docs for depth.

## What a lump is

A **lump** is a configured, long-running agent loop campaign: a large body of work broken into small units that an agent completes one at a time, each shipped as its own git branch/PR. Core vocabulary:

| Term | Meaning |
|------|---------|
| **Project** | A folder containing both `.git/` and `.lumpcode/`. |
| **Lump** | One campaign under `.lumpcode/lumps/<lumpName>/` (config + templates + hooks). |
| **Context** | One unit of work in a lump (e.g. one file/component/ticket). Has a `name` and `variables`. |
| **Marker commit** | Each finished context commits `LUMP: <lumpName> - <contextName>`; Lumpcode reads this from `origin` to know what's done (**resumable**). |
| **Command** | The coding agent invoked per prompt (e.g. `"copilot"`, `"cursor"`, or a custom module). |

Docs: [concepts.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/concepts.md) · [get-started.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/get-started.md)

## Workflow

Copy this checklist and track progress:

```
- [ ] Step 1: Confirm project is initialized (.lumpcode/ exists)
- [ ] Step 2: Gather requirements from the user
- [ ] Step 3: Scaffold the lump (lumpcode lump-create)
- [ ] Step 4: Choose ONE context source
- [ ] Step 5: Write the prompt or steps
- [ ] Step 6: Validate the config with lumpcode lump-plan
```

This skill's job ends at a validated config. It never runs the lump — the user decides when to execute it with `lumpcode run <lumpName>` (or `lumpcode start` for the daemon).

### Step 1: Confirm the project is initialized

The lump lives at `.lumpcode/lumps/<lumpName>/`. If `.lumpcode/` does not exist yet, the user must initialize once from the repo root (needs a git `origin` and a primary branch, usually `main`, that already exists on `origin`):

```bash
lumpcode project-setup
```

This creates `.lumpcode/project.json` (committed) and `.lumpcode/local.json` (per-machine, gitignored, holds `mode` + `primaryBranch`). Details: [get-started.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/get-started.md#step-1-initialize-the-lumpcode-project) · [local-config.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/local-config.md).

### Step 2: Gather requirements

Before writing config, get these from the user (ask only what you can't infer):

1. **Lump name** — camelCase, e.g. `reactToVue`, `addTests`.
2. **The repeated task** — what should the agent do on each unit of work?
3. **What defines a "unit of work"** — one file? one folder/component? a fixed list of tickets? a scan with skip logic? This picks the context source (Step 4).
4. **Which agent** — the `command`. `"copilot"` and `"cursor"` are built-in and need `copilot` / `cursor-agent` on `PATH`.
5. **One prompt or several steps** — single pass vs. an ordered multi-step plan.
6. **Ordering / dependencies** (optional) — must some units finish before others?

### Step 3: Scaffold

```bash
lumpcode lump-create <lumpName>              # config.json (default)
lumpcode lump-create <lumpName> --config js  # config.js  (inline functions)
lumpcode lump-create <lumpName> --config ts  # config.ts  (typed, inline functions)
```

Choose the format by capability:

- **`config.json`** — static lumps; no inline functions (function fields must be string file paths).
- **`config.js` / `config.ts`** — needed for **inline** functions (`getContextListFn`, `contextMatchFn`, dynamic `steps`, hooks). `.ts` is transpiled automatically. Precedence when several exist: `config.ts` → `config.js` → `config.json`.

For typed hints in `.js`/`.ts`, install `@lumpcode/cli-types` and wrap the export in `defineConfig(...)`:

```bash
npm install --save-dev @lumpcode/cli-types
```

### Step 4: Choose ONE context source (required)

A runnable lump needs **exactly one** context source:

| Field | Use when | Form |
|-------|----------|------|
| `contextListJson` | Units map to file **path patterns** in the repo | Inline object (or path to a JSON file) |
| `getContextListFn` | Units come from a **custom list** (tickets, an API, computed) | Function (inline in `.js`/`.ts`, or a string path to a module) |
| `contextMatchFn` | Units come from **scanning files** with skip logic | Function (inline in `.js`/`.ts`, or a string path to a module) |

**`contextListJson`** — each key becomes a variable; each value is a path template. `{PLACEHOLDER}` captures a path segment from the real file tree; the context is created once per real match. The context **name** is the captured value(s). Naming-convention modifiers: `$upperFirst`, `$camel`, `$kebab`, `$snake`, `$lower`, `$pascal` (e.g. `$upperFirst{NAME}` requires the on-disk text to equal `UpperFirst(NAME)`).

```json
"contextListJson": { "FILE": "src/{NAME}.ts" }
```

**`getContextListFn`** — returns an array of `{ name, variables, options? }`. `options` may set `priority` (lower runs sooner) and `dependsOnContexts` (names that must be `finished` first).

```js
export default function getContextListFn() {
  return [
    { name: "01-schema", variables: { TICKET: "add table" }, options: { priority: 1 } },
    { name: "02-api", variables: { TICKET: "expose route" }, options: { priority: 2, dependsOnContexts: ["01-schema"] } },
  ];
}
```

**`contextMatchFn`** — called once per scanned path; return `null` to skip, or `{ contextName, filePathVariableName }` to include (matches sharing a `contextName` merge).

```js
import fs from 'node:fs';
export default function match({ codeBasePath }) {
  const { isDir, path } = codeBasePath;
  if (isDir || !path.endsWith('.ts') || path.endsWith('.test.ts')) return null;
  if (fs.existsSync(path.replace(/\.ts$/, '.test.ts'))) return null;
  return { contextName: path.replaceAll('/', '_'), filePathVariableName: 'SOURCE' };
}
```

Deep reference: [lump-config.md § context sources](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/lump-config.md#contextlistjson) · shapes in [types.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/types.md).

### Step 5: Write the prompt or steps (required)

A runnable lump needs **exactly one** prompt definition:

| Field | Use when |
|-------|----------|
| `prompt` | A single agent pass. String shorthand, or an object with `promptTemplate` + `command`. |
| `steps` | An ordered list of passes. Each item is a string, an object, or (in `.js`/`.ts`) a function that returns more items dynamically. |

**Prompt template syntax:** in `promptTemplate` (and string prompts) only braced placeholders are substituted — `{VAR}` inserts the literal value of `context.variables.VAR`. `VAR` must be a key from your context source. Write `@{VAR}` when the agent treats a leading `@path` as file context.

A `promptTemplate` value that has **no whitespace** and ends in `.md`, `.txt`, `.template`, or `.prompt` is read as a **lump-relative template file** instead of inline text.

Per-step object fields: `promptTemplate` (or `promptFn`), `command`, `stepVariables`, `timeoutMillis`, `postCommandExecFn`, `continueOnError`.

**A step does not have to be an agent prompt.** Two ways to run non-agent work as a step:

- **Omit the prompt.** `promptTemplate`/`promptFn` are optional; when both are absent the `command` still runs and just receives an empty prompt string.
- **Run a plain command (`config.js` / `config.ts` only).** Give a step an inline `commandFn` returning a `{ executable, args, env? }` descriptor — an ordinary shell/build/git/validation command with no LLM involved. Return `null` to skip the step. This is how you build verification and retry loops between agent passes (see the `loop-example` lump and [advanced-config.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/advanced-config.md#dynamic-steps) · [types.md § CommandFn](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/types.md#commandfn)).

### Step 6: Validate

Validate the config with `lump-plan`:

```bash
lumpcode lump-plan <lumpName>
```

`lump-plan` is non-destructive — it loads the config, runs context discovery, and previews the resolved prompts, but does **not** run the agent, branch, or push. It surfaces the errors that break a lump: more than one (or no) context source, more than one (or no) prompt definition, missing `{VAR}` values, unreadable modules or template files. Fix anything it reports and re-run until it succeeds.

Before running it, sanity-check the config yourself:

- Exactly **one** context source (`contextListJson` / `getContextListFn` / `contextMatchFn`) and exactly **one** prompt definition (`prompt` / `steps`).
- Every `{VAR}` / `@{VAR}` in prompts maps to a key produced by the context source.
- In `config.json`, all `*Fn` fields are string file paths (inline functions need `config.js` / `config.ts`).

Stop here: the config is ready for the user to run whenever they choose.

## Optional top-level fields

Set only what's needed:

| Field | Type | Purpose |
|-------|------|---------|
| `command` | string | Default agent for steps that don't set their own. |
| `baseBranch` | string | Override the branch this lump works off (default: `primaryBranch` from `local.json`). |
| `branchFn` | function ref | Custom branch naming (default `lump/<lumpName>/<context…>`). |
| `numberOfContextsPerBranch` | number | Group several contexts per branch/PR (default `1`). |
| `maximumNumberOfConcurrentBranches` | number | Skip when this many open `lump/<lumpName>/*` branches already exist on `origin`. |
| `contextOptionsFn` | function ref | With `contextListJson` only: attach `priority` / `dependsOnContexts` per context. |
| `lumpVariables` | object | Arbitrary JSON passed to hooks and prompt functions. |
| `setupFn` / `teardownFn` | function ref | Per-context lifecycle hooks. |
| `disabled` | boolean | Daemon (`start`) skips this lump; manual `run` still works. |
| `keepHistory` | boolean | Log each prompt step to `history/<contextName>.yaml` (gitignored). |
| `verbose` | boolean | Extra engine logging. |

Full field reference and hook signatures: [lump-config.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/lump-config.md) · [advanced-config.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/advanced-config.md) · [types.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/types.md).

## Example configs

**Minimal — one file per context, single prompt** (`config.json`):

```json
{
  "$schema": "https://lumpcode.com/schemas/lumpConfig.schema.json",
  "contextListJson": { "FILE": "src/{NAME}.ts" },
  "prompt": {
    "promptTemplate": "Improve the types in @{FILE}.",
    "command": "copilot"
  }
}
```

**Multi-step migration — one component folder per branch** (`config.json`):

```json
{
  "command": "copilot",
  "contextListJson": {
    "COMPONENT": "src/components/{NAME}/$upperFirst{NAME}.tsx",
    "TEST": "src/components/{NAME}/{NAME}.test.ts"
  },
  "steps": [
    "Read @{COMPONENT} and @{TEST}. Save a short migration plan to src/vue/{NAME}/plan.md. No source changes yet.",
    "Follow src/vue/{NAME}/plan.md to port @{COMPONENT} to a Vue 3 component at src/vue/{NAME}/{NAME}.vue. Keep behavior identical.",
    "Port @{TEST} to Vitest at src/vue/{NAME}/{NAME}.test.ts. Run the tests and fix failures."
  ]
}
```

More recipes (ticket queue, coverage sweep, codemod, cross-lump dependencies): [examples.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/examples.md).

## Before finishing

- Confirm the config has exactly one context source and exactly one prompt definition.
- Confirm inline functions are only used in `config.js` / `config.ts` (in `config.json`, `*Fn` fields must be string paths to modules).
- Run `lumpcode lump-plan <lumpName>`, resolve any errors, and report the discovered contexts to the user.
