# Lumpcode

Lumpcode is a **CLI and library for running agent loops** over your codebase. **Simple to start, powerful when you need it:** a few CLI commands and one config file get your first lump running; TypeScript configs, hooks, dynamic steps, and custom agent commands are there when your campaigns grow. You configure each **agent loop campaign** as a **lump**, with agent work on git branches for **human review through PR merge**.

Lumpcode is still in **early development**; expect rough edges and **many improvements in the near future**.

> *Named after the **lumpfish**: a small cleaner fish that salmon farmers add to their pens to quietly pick parasites off the salmon. Lumpcode plays the same role in your codebase, steadily working through the long tail of repetitive coding chores (codemods, doc updates, dependency updates, new abstractions, missing tests...) one batch at a time, without overflowing you with PRs, while you stay focused on your code.*

<p align="center"><em>See how cute it is:</em></p>

<p align="center">
  <img src="assets/lumpfish.png" alt="Juvenile lumpfish" width="240">
</p>

> Also, **LUMP** can stand for **Loop Using Multiple Prompts**: one or more prompts per context, often across many similar units of work.

AI coding agents (Claude CLI, Codex, Aider, Cursor) work great on a single file or task. Lumpcode orchestrates them with a straightforward workflow: batched **contexts**, git-isolated branches, marker commits for resumable progress, shipped presets for common agents, and optional background scheduling. You stay in control of how much complexity you add.

A **lump** is one **agent loop campaign** in your repo (e.g. "migrate every component to Vue"): context discovery, prompt(s), and an agent command under `.lumpcode/lumps/<lumpName>/`. It spans many **contexts**, not a single chat session. Each finished context gets a **marker commit** subject `LUMP: <lumpName> - <contextName>`, so repeated runs are **resumable** from remote git history after you merge PRs.

**Use Lumpcode when** you have many similar edits (migrations, tests, docs), an ordered ticket queue, or long-running refactors you want to tick forward on a schedule.

## Install

**Requirements:** Node.js 22+

```bash
npm install -g @lumpcode/cli
```

Verify: `lumpcode --version`

## Quick start

Four steps: install, scaffold the project, create a lump, run it. No custom code required for your first campaign.

From the root of a git repository you can push to **`origin`**.

**Prerequisites:** git `origin` push access, a CLI agent on `PATH`, and awareness that `run` invokes your agent (LLM cost). Details: [Getting started § Prerequisites](packages/apps/cli/DOCS/get-started.md#prerequisites).

```bash
lumpcode project-setup
lumpcode lump-create myFirstLump
```

Edit `.lumpcode/lumps/myFirstLump/config.json` (see the [React-component example](packages/apps/cli/README.md#configjson-example-one-branch-per-react-component) in the CLI README), then:

```bash
lumpcode run myFirstLump
```

This runs your agent on **one** context, commits a `LUMP: myFirstLump - …` marker, and pushes a `lump/myFirstLump/…` branch to `origin` for you to open as a PR.

**Full walkthrough:** [Getting started](packages/apps/cli/DOCS/get-started.md) · **Concepts:** [concepts.md](packages/apps/cli/DOCS/concepts.md) · **Config examples & daemon:** [CLI README](packages/apps/cli/README.md)

## Simple by default, powerful when you need it

| Start here | Grow into |
|---|---|
| `project-setup`, `lump-create`, `run` | Background daemon (`start`) on a cron |
| One `config.json` with `contextListJson` and `prompt` | `config.ts`, hooks, recursive `steps` |
| Shipped agent presets (`copilot`, `cursor`, …) | Custom command modules and `agentPermissions` |

The same lump config scales from a one-off migration to a long-running queue without changing how you invoke the CLI.

## Documentation

| Doc | Contents |
|---|---|
| [Getting started](packages/apps/cli/DOCS/get-started.md) | Zero → first successful `lumpcode run` |
| [CLI README](packages/apps/cli/README.md) | Config examples, daemon, doc index |
| [Command reference](packages/apps/cli/DOCS/commands.md) | Every subcommand and flag |
| [Core README](packages/core/README.md) | `@lumpcode/core` engine API |

## Monorepo packages

| Package | npm | Role |
|---|---|---|
| `packages/core` | [`@lumpcode/core`](https://www.npmjs.com/package/@lumpcode/core) | Engine API (`runLump`): Not intended for direct use; install `@lumpcode/cli` |
| `packages/apps/cli` | [`@lumpcode/cli`](https://www.npmjs.com/package/@lumpcode/cli) | CLI: project setup, run, daemon, status |
| `packages/apps/cli/cli-types` | [`@lumpcode/cli-types`](https://www.npmjs.com/package/@lumpcode/cli-types) | Typed `config.js` and command-module helpers |

All three are open source under [Apache 2.0](LICENSE).
