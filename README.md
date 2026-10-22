# Lumpcode

Lumpcode runs your coding agent through work too big for one chat: a migration, a ticket backlog, a test suite to build out. It takes one item at a time, runs the agent (Cursor, Claude Code, Copilot, Codex, OpenCode, or your own), and pushes a branch you review as a normal PR. Progress lives in your git history, so it always picks up where it left off. No account, no database.

You describe the campaign once as a **lump**: what to work on, what to prompt, which agent. That is **loop engineering**: you design the loop, Lumpcode runs it. Rehearse a lump on your laptop, then leave a **worker** running on a second clone and merge the branches as they arrive.

Lumpcode is in **early development**. Expect rough edges and frequent improvements.

## Quick start

Requires Node.js 22+, a git repo you can push to, and a CLI agent on `PATH`.

```bash
npm install -g @lumpcode/cli
lumpcode setup
```

`setup` creates `.lumpcode/`, writes a first lump, and runs it on your current branch. Nothing is pushed until you push. A lump looks like this:

```json
{
  "contextListJson": {
    "COMPONENT": "src/components/{NAME}/index.tsx",
    "TEST": "src/components/{NAME}/index.test.tsx"
  },
  "prompt": {
    "promptTemplate": "Port @{COMPONENT} to Vue 3 and update @{TEST}.",
    "command": "cursor"
  }
}
```

Every component folder with both files is one unit of work. Once your lump looks right, a worker runs them all, one branch each.

Optional: `npx skills add lumpcode/skills` teaches the agent in your editor to write and fix lumps.

## Docs

Start at [lumpcode.com/docs](https://www.lumpcode.com/docs/start/overview) or browse the same pages in [`packages/apps/cli/DOCS/`](packages/apps/cli/DOCS/README.md):

- [First PR](packages/apps/cli/DOCS/start/first-pr.md) and [Leave a worker running](packages/apps/cli/DOCS/start/worker.md)
- [Examples](packages/apps/cli/DOCS/examples/overview.md): migrations, issue queues, ticket backlogs, lumps that feed lumps
- [Watch it work](packages/apps/cli/DOCS/start/observe.md): dashboard, transcripts, status
- [Commands](packages/apps/cli/DOCS/reference/commands.md)

## Packages

| Package | Role |
| --- | --- |
| [`@lumpcode/cli`](packages/apps/cli) | The `lumpcode` command. This is what you install. |
| [`@lumpcode/cli-utils`](packages/apps/cli/cli-utils) | `defineConfig` and typed helpers for `config.ts` |
| [`@lumpcode/recipes`](packages/recipes) | Retry loops, folder backlogs, PR opening, ready-made lump factories |
| [`@lumpcode/core`](packages/core) | The engine behind the CLI. Not meant for direct use. |
| [`@lumpcode/cli-types`](packages/apps/cli/cli-types) | Types only; prefer `@lumpcode/cli-utils` |
| `packages/apps/website` | [lumpcode.com](https://www.lumpcode.com), not published |

Open source under [Apache 2.0](LICENSE). Contributing: see [GIT-FLOW.md](GIT-FLOW.md).

## Why the name

> *Named after the **lumpfish**: a small cleaner fish that salmon farmers add to their pens to quietly pick parasites off the salmon. Lumpcode plays the same role in your codebase, steadily working through the long tail of coding chores one batch at a time, without flooding you with PRs.*

<p align="center">
  <img src="assets/lumpfish.jpg" alt="A young lumpfish swimming straight at the camera, fins spread" width="240"><br>
  <em>Small, a bit goofy, works through the whole list.</em><br>
  <sub>Photo: <a href="https://commons.wikimedia.org/wiki/File:Merivarblane.jpg">Tiit Hunt</a>, <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, via Wikimedia Commons (resized).</sub>
</p>

**LUMP** also stands for **Loop Using Multiple Prompts**.
