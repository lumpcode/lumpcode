# What is a software factory?

A software factory is a repeatable setup that turns a list of work into reviewed code changes: a coding agent does each piece, and your tests, your CI, and your reviewers check it. Lumpcode is an open-source way to run small software factories inside your own repo, with your CLI coding agent and git as the only state.

## The short version

Your coding agent already handles one task well: one branch, one pull request. A software factory runs the whole list, and keeps running. Two hundred components to port, every module without a test, forty tickets, whatever your linter reports: you describe the list once, and the factory works through it one reviewable branch at a time.

In Lumpcode, one factory is a **lump**: a folder in `.lumpcode/lumps/` that says

- **what to work on**: a path pattern, a ticket folder, or a command that lists the work
- **what to tell the agent**: one prompt, or several steps gated on your build or tests
- **which agent runs it**: Cursor, Claude Code, Copilot CLI, Codex, OpenCode, or your own
- **how to check the result**: your build, your tests, your review

You commit the lump like the rest of your code, so changing a factory is a pull request your team reviews.

## Micro software factories, not one big one

Lumpcode does not ask you to model your whole delivery process. A lump can be as narrow as one migration or as broad as a spec backlog that keeps growing. Start with one, then grow a fleet of small factories, one per flow:

- a one-time migration or codemod that is done when its list is empty
- background hygiene: missing tests, docs that drifted, what static analysis reports
- tickets from markdown folders, Jira, Azure DevOps, or labelled GitHub issues
- factories that feed each other: one lump files bugs as tickets, another fixes them

[Examples](../examples/overview.md) shows each pattern with a real config.

## How Lumpcode runs a factory

Each piece of work is a **context**: a file, a group of files, or a ticket. Lumpcode takes the next unfinished context, runs your agent on it inside your repo, where your skills, `AGENTS.md`, and docs already are, commits the result, and pushes a branch. You review each branch as a pull request, opened by you or [automatically after the push](../author/recipes.md#open-a-pull-request-after-push), or let your CI merge it. The next run skips what you merged.

Progress lives in branches and commits on your git remote. There is no account, no database, and no backend, so any clone picks up where another stopped. Try one pass on your laptop with `lumpcode run`, then leave a [worker](worker.md) running with `lumpcode start` on a second clone or an always-on machine.

## Compared with other ways to run an agent

| Approach | What you get | What is missing |
| --- | --- | --- |
| Prompting the agent by hand | Full control of each task | You are the loop: every item needs you to start it |
| A shell loop around the agent | Runs the whole list | Resuming after a crash, one reviewable branch per item, clean workspaces, cleaning up stray processes |
| A hosted agent platform | Managed runs | Runs and state live in another service, and the agent works without your local setup unless you rebuild it there |
| A lump | The list, the prompts, and the agent as code in your repo, one branch per piece of work | Lumpcode stops at `git push`: merging stays with you or your CI |

## What Lumpcode is not

- It does not merge. You or your CI do.
- It does not push to your main branch. Work lands on `lump/<lumpName>/…` branches.
- It is not an end-to-end platform from intake to deploy. It runs your agent, checks the result with the steps you define, and pushes a branch.

## Questions

### Which coding agents does it work with?

Cursor, Claude Code, Copilot CLI, Codex, and OpenCode work as they are. For anything else, write a small [command module](../author/agents.md#custom-command-module).

### Do I need a server?

No. A lump runs on your laptop with `lumpcode run`. For unattended runs, a worker can be a second clone on the same machine; an always-on machine is the best setup.

### Where is the state stored?

In git. Lumpcode reads what is finished from branches and marker commits on your git remote. See [How a run works](run.md).

### Is it free?

Yes. Lumpcode is open source under Apache-2.0. You pay only for the agent you already use.

### How do I start?

```bash
npm install -g @lumpcode/cli
lumpcode setup
```

Then follow [First PR](first-pr.md).
