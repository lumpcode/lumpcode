# Lumpcode CLI

Lumpcode is a **CLI for running agent loops** over your codebase. You configure each **agent loop campaign** as a **lump**, with agent work on git branches for **human review through PR merge**.

> *Named after the **lumpfish**: a small cleaner fish that salmon farmers add to their pens to quietly pick parasites off the salmon. Lumpcode plays the same role in your codebase, steadily working through the long tail of repetitive coding chores (codemods, doc updates, dependency updates, new abstractions, missing tests...) one batch at a time, without overflowing you with PRs, while you stay focused on your code.*

A **lump** is one **agent loop campaign** in your repo (e.g. "migrate every component to Vue"): context discovery, prompt(s), and an agent command under `.lumpcode/lumps/<lumpName>/`. It spans many **contexts**, not a single chat session. Each finished context gets a **marker commit** subject `LUMP: <lumpName> - <contextName>`, so repeated runs are **resumable** from remote git history after you merge PRs.

**Use Lumpcode when** you have many similar edits (migrations, tests, docs), an ordered ticket queue, or a long-running refactor you want to tick forward on a schedule.

**New here?** Read [DOCS/concepts.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/concepts.md) (two minutes), then [DOCS/get-started.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/get-started.md).

## Install

**Requirements:** Node.js 22+

```bash
npm install -g @lumpcode/cli
```

Verify: `lumpcode --version`

## Quick start

From the root of a git repository you can push to **`origin`**.

**Prerequisites:** git `origin` push access, a CLI agent on `PATH`, and awareness that `run` invokes your agent (LLM cost). Details: [DOCS/get-started.md § Prerequisites](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/get-started.md#prerequisites).

```bash
lumpcode project-setup
lumpcode lump-create myFirstLump
```

Edit `.lumpcode/lumps/myFirstLump/config.json` (see the [React-component example below](#configjson-example-one-branch-per-react-component)), then:

```bash
lumpcode run myFirstLump
```

This runs your agent on **one** context, commits a `LUMP: myFirstLump - …` marker, and pushes a `lump/myFirstLump/…` branch to `origin` for you to open as a PR.

Step-by-step: [DOCS/get-started.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/get-started.md). Run flow diagram: [DOCS/concepts.md § One run, end to end](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/concepts.md#one-run-end-to-end).

### Run continuously as a daemon

Once a one-off `run` works end to end, have a background daemon tick every lump on a cron (default: every 5 minutes):

```bash
lumpcode start          # detached background daemon
lumpcode daemon-status  # is it running?
lumpcode stop           # SIGTERM + cleanup
```

Because the daemon keeps invoking your agent on every tick, **cap parallel work** with `maximumNumberOfConcurrentBranches` (per lump or in `project.json`) and set `"disabled": true` on a lump to take it out of the rotation without stopping the scheduler.

Sporadic `run` vs sustained `start`: [DOCS/concepts.md#when-to-use-run-vs-start-daemon](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/concepts.md#when-to-use-run-vs-start-daemon).

## `config.json` example: one branch per React component

Suppose your repo has one folder per React component, each with the same three related files:

```text
src/components/
├── Button/
│   ├── Button.tsx
│   ├── Button.types.ts
│   └── Button.test.tsx
├── Card/
│   ├── Card.tsx
│   ├── Card.types.ts
│   └── Card.test.tsx
└── Modal/
    ├── Modal.tsx
    ├── Modal.types.ts
    └── Modal.test.tsx
```

`.lumpcode/lumps/myFirstLump/config.json`:

```json
{
  "$schema": "https://lumpcode.com/schemas/lumpConfig.schema.json",
  "baseBranch": "main",
  "contextListJson": {
    "COMPONENT": "src/components/{COMPONENT_NAME}/{COMPONENT_NAME}.tsx",
    "TYPES":     "src/components/{COMPONENT_NAME}/{COMPONENT_NAME}.types.ts",
    "TEST":      "src/components/{COMPONENT_NAME}/{COMPONENT_NAME}.test.tsx"
  },
  "prompt": {
    "promptTemplate": "Tighten the prop types in @{COMPONENT} (declared in @{TYPES}) and add any missing assertions to @{TEST}.",
    "command": "copilot"
  }
}
```

Lumpcode scans the tree and finds every value `{COMPONENT_NAME}` can take such that **all three rows resolve to a real file**. With the tree above, that yields **three contexts (Button, Card, Modal)** — one work branch and marker commit each. A component missing any of the three files is silently skipped.

- `contextListJson` — Each value is a **path template** with `{PLACEHOLDER}` captures; each key (here `COMPONENT`, `TYPES`, `TEST`) becomes a variable usable in the prompt as `{COMPONENT}`, `{TYPES}`, `{TEST}`. See [DOCS/lump-config.md#contextlistjson](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/lump-config.md#contextlistjson).
- `promptTemplate` — `{VAR}` substitutes the literal value; e.g you can safely use `@{VAR}` to have the same value with a leading `@` for agents that treat `@path` as file context. See [DOCS/lump-config.md#prompt-template-syntax](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/lump-config.md#prompt-template-syntax).
- `command` — Registered [command name](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/lump-config.md#command-names) only (`"copilot"`, `"cursor"`, …), not shell flags ([DOCS/advanced-config.md#custom-agent-commands](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/advanced-config.md#custom-agent-commands)).
- `$schema` — Optional but recommended: most editors will then autocomplete and validate every field above.

## TypeScript hints for `config.ts`, `config.js`, and command modules

Lumpcode loads **`config.ts`** (highest precedence), **`config.js`**, and **`config.json`**, plus **`.js/.ts`** hook and command modules under `.lumpcode/`. Optional npm package [`@lumpcode/cli-types`](https://www.npmjs.com/package/@lumpcode/cli-types) ships `defineConfig`, `defineCommand`, and other thin helpers plus the same types the CLI uses. See [DOCS/lump-config.md — Typed config](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/lump-config.md#typed-config-optional) and [DOCS/lump-config.md — TypeScript modules](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/lump-config.md#typescript-modules).

## Related packages

| Package | npm | Role |
| --- | --- | --- |
| `@lumpcode/cli` | [npm](https://www.npmjs.com/package/@lumpcode/cli) | Agent loop campaigns — this package (`npm install -g @lumpcode/cli`) |
| `@lumpcode/core` | [npm](https://www.npmjs.com/package/@lumpcode/core) | Engine API (`runLump`) — library use or advanced integration |
| `@lumpcode/cli-types` | [npm](https://www.npmjs.com/package/@lumpcode/cli-types) | TypeScript helpers for lump `config.ts` and command modules |
| `lumpcode` | [npm](https://www.npmjs.com/package/lumpcode) | Optional unscoped alias for `@lumpcode/cli` |

## Where to next


| Doc                                                | Contents                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [DOCS/concepts.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/concepts.md)               | Project, lump, context, branch, context status; `run` vs `start`; workspace copies |
| [DOCS/get-started.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/get-started.md)         | Zero → first successful `lumpcode run`                                             |
| [DOCS/commands.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/commands.md)               | Every subcommand and flag                                                          |
| [DOCS/project-config.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/project-config.md)   | `.lumpcode/project.json`                                                           |
| [DOCS/lump-config.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/lump-config.md)         | `config.json` / `config.js` / `config.ts` fields                                   |
| [DOCS/advanced-config.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/advanced-config.md) | Hooks, dynamic `steps`, custom commands                                      |
| [DOCS/examples.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/examples.md)               | Ready-made lump shapes (smoke test, migration, tickets, codemods, docs, …)         |
| [DOCS/types.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/types.md)                     | Hook and JSON type shapes                                                          |

## Development

From `packages/apps/cli`: `npm test` (unit), `npm run test:e2e` / `test:e2e:node` (scenarios). See `scripts/run-e2e.mjs` and `src/e2e/` for CI/Windows overrides.
