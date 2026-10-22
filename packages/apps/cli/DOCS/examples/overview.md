# Pick an example

Each example is a lump running on a real repo, cut down to the pattern. Find the job closest to yours, copy the config, change the paths and the prompt, and check it with `lumpcode lump-plan <lumpName> --contexts`.

| You want to | Example |
| --- | --- |
| Migrate every component to a new styling system or framework | [A migration that shrinks as it goes](sweeps.md#a-migration-that-shrinks-as-it-goes) |
| Make the same small change in hundreds of files | [A codemod, ten files per PR](sweeps.md#a-codemod-ten-files-per-pr) |
| Work through a list you generated first | [An inventory, then a migration](sweeps.md#an-inventory-then-a-migration) |
| Bring every module to one standard shape, tests included | [One standard per module](sweeps.md#one-standard-per-module) |
| Add tests where there are none | [Tests where they are missing](sweeps.md#tests-where-they-are-missing) |
| Fix what your code-quality server reports | [Static-analysis issues, grouped per file](issue-queues.md#static-analysis-issues-grouped-per-file) |
| Fix the bugs your team labels for the agent | [Labelled bugs, verified in a browser](issue-queues.md#labelled-bugs-verified-in-a-browser) |
| Ship a roadmap of features from ticket folders | [A feature backlog in git](backlogs.md#a-feature-backlog-in-git) |
| Run several backlogs with the same rules | [Lanes that share one factory](backlogs.md#lanes-that-share-one-factory) |
| Turn a pile of notes into tickets | [Triage an inbox into lanes](pipelines.md#triage-an-inbox-into-lanes) |
| Find duplicated code and refactor it | [Find, file, implement](pipelines.md#find-file-implement) |
| Start one campaign after another is merged | [Wait on another lump](pipelines.md#wait-on-another-lump) |
| Never push code that fails your checks | [Retry until green](building-blocks.md#retry-until-green) |
| Skip an expensive step when it is not needed | [Run a step only when needed](building-blocks.md#run-a-step-only-when-needed) |
| Give the agent a running app to test against | [Start a dev server for the agent](building-blocks.md#start-a-dev-server-for-the-agent) |
| Open a PR on GitHub, Azure DevOps, or GitLab | [Open a pull request after push](building-blocks.md#open-a-pull-request-after-push) |
| Pause a lump while its queue is full | [Pause when downstream is full](building-blocks.md#pause-when-downstream-is-full) |
| Run some lumps daily and others every minute | [Different schedules per lump](building-blocks.md#different-schedules-per-lump) |

New to lumps? Start with the [smoke test](building-blocks.md#smoke-test) and [Write a lump](../author/write-a-lump.md).

## What the good ones have in common

- **The list shrinks by itself.** Discovery skips work that is already done (a component with no `<style>` left, a file that already has a test), so re-running is always safe.
- **A check gates every branch.** Lint, typecheck, or tests run after the agent, and failures go back to the agent with the output. See [Retry until green](building-blocks.md#retry-until-green).
- **Review stays small.** `numberOfContextsPerBranch` groups tiny diffs; `maximumNumberOfConcurrentBranches` stops the worker from piling up PRs while you are away.
- **Prompts point at the repo.** Long instructions live in a prompt file or a skill the repo already has (`Follow @.agents/skills/…/SKILL.md`), so the config stays short.
