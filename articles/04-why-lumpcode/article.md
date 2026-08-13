# Codemods grew a brain. Our tooling didn't.

## 1. Something changed in how we do the boring work

For years, large-scale code changes had two shapes.

Either the change was mechanical, and you wrote a codemod: an AST transform, a regex, a script. Deterministic, fast, reviewable. Also brittle, and only able to express what you could fully specify up front.

Or the change needed judgment, and you did it by hand. A ticket per file, a PR per module, weeks of hand edits.

Coding agents collapsed that gap. A loop step can now be "rewrite this util the way the codebase does it" instead of "match this pattern and replace it". Fuzzy work became automatable: a rename that needs context, normalize a util and add tests, a migration that isn't a pure AST rewrite.

One thing did not change: **git is still how a project ships and remembers.**

**Git is the gate:** Code enters the mainline through reviewable PRs. The unit of trust is a change a human can hold in their head.

**Git is the source of truth:** What landed, when, and on which branch lives in remote history. The git remote is the record; you do not need a side system to know the state of the project.

So if agents are going to do the fuzzy work, the loops around them should plug into that same gate and that same record.

**Git-first gate for loops:** Slice a large body of work into isolated contexts, one branch and one PR each. An agent that rewrites 200 files in one commit has produced something nobody will read. Keep the campaign itself in the repo, so a change to the loop ships as a normal diff and gets reviewed like any other change.

**Git-first source of truth for loops:** Four hundred utils to clean is not a session, it is a campaign. It runs for weeks at the speed your team can review, and it has to survive you closing your laptop. Merge three PRs today, leave four for tomorrow: what is left should come from the git remote, not from a distant database or service.

That is the shape I started calling a **git-first loop manager**. I kept looking for one, and kept not finding it.

## 2. The space is crowded. The crowd is standing elsewhere.

I went looking. Four categories, none on this axis.

**Agent frameworks** (LangGraph, CrewAI, AutoGen) call models; they do not drive the coding agents I already trust, and they do not know what a branch or a PR is.

**Worktree orchestrators** (Conductor, ParallelCode, git-parsec, Stoneforge) nail isolation, but they parallelize tasks you dispatch now from a GUI. The task list is not a committed artifact, so there is nothing to version or re-run next month.

**Enterprise large-scale-change platforms** (Sourcegraph Agentic Batch Changes, Moderne, Codemod.com) are closest by intent, and genuinely good. They are also heavy to put in place, not open source where it counts, and the campaign lives in their system, not in your repository.

**Vendor cloud agents** (Copilot, Codex cloud, Cursor cloud agents) already give you one task, one branch, one PR. What is missing is the loop above them: know what is left, pick the next slice, run your gates, keep going for a month while you merge.

## 3. So I am building Lumpcode, a git-first loop manager

Lumpcode is a small CLI for one job: running long agent campaigns over your own repo, in reviewable slices.

The unit is a **lump**: a body of work too big for one chat, described once and then worked through over days or weeks. You can run a tick by hand, or leave a daemon to pick up the next eligible slice on a schedule while you review yesterday's PRs.

- **Git-first.** A repo with git access and a coding agent on PATH is the whole dependency list. Loops and progress live in the repo.
- **No external state.** Progress is derived from commit messages on remote branches. The repo is the database.
- **Context isolation by construction.** One context, one branch, one PR. Merge what is good; the next tick continues with the rest.
- **Resumable by default.** Stop for a week, come back, run it again. It re-derives what is left from the remote.
- **Mixed steps.** Prompts and plain shell commands sit side by side, with retry loops and custom validation.
- **Agent-agnostic.** Cursor, Copilot CLI, Claude Code, Codex, whatever the team already uses.
- **Easy to start, configurable when you need it.** One `npm install`, no server, no indexing step. JSON for the simple case, TypeScript when you want real logic. Apache 2.0.

Git-first is also practical day to day. Tweak a prompt or a validation step, push: the next tick runs the new version. Add a new lump, push: the daemon finds it. The worker resets to the base branch every tick, so whatever is on that branch *is* the configuration. A change to a loop arrives as a diff, and gets reviewed like any other diff.

## 4. Three campaigns I have run

The first two live in this repo under `.lumpcode/lumps/` — including the finished CLI campaign and the two abstraction lumps that still tick. Open the configs if you want to see how they are wired. The third ran on a client monorepo.

**Building Lumpcode with Lumpcode.** Early on, each CLI command was a backlog item with priority and dependencies. The lump opened one PR per command. Most of the CLI surface was implemented that way. I reviewed each, added some pushback for some PRs, and now the campaign is over.

**Hunting my own duplication.** Two lumps in a pipeline. The first finds one duplicated pattern and writes a small requirements folder into the second lump's backlog. The second implements the util, refactors call sites, and validates with build and test. It never finishes by design: twelve utils have landed through it so far, one PR at a time.

**Cleaning a client monorepo.** Hundreds of utils, inconsistently structured and thinly tested. One util is one context. The agent normalizes structure and writes tests; a deterministic step runs typecheck, lint, and that util's tests, then retries on failure up to four times. PRs stay small. The campaign has run for weeks, capped at three open branches so it never floods review, and nobody had to change how they review code.

## 5. Where it is

Early development, Apache 2.0, on npm as `@lumpcode/cli`. Agents don't replace review — they feed it. Describe the campaign once; spend a little time each day merging.

The name: I was looking for something for the CLI and remembered a trip by a lake where small fish came to clean the feet of people who put them in the water. Looking up cleaner fish, I found the **lumpfish** — used to clean salmon farms and aquariums. Hence Lumpcode. Also, the lumpfish is cute.

Repo: [https://github.com/lumpcode/lumpcode](https://github.com/lumpcode/lumpcode)