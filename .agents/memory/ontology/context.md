# Context

One unit of work inside a lump: a file, a group of files, a ticket. Never "one file" or "one PR" by definition; `numberOfContextsPerBranch` puts several on one branch. Type: `Context` in `packages/core/src/types/Context.ts` (`name`, `variables`, optional `options.priority` / `options.dependsOnContexts`).

Its `name` identifies it in the branch name and the marker commit, so names are unique per lump and match `^[a-zA-Z0-9_-]+$`. Variables fill `{VAR}` / `@{VAR}` in prompts. How contexts are found: `domain/context-sourcing.md`. Its state: `context-status.md`.

- `getToDoContextList` validates names via `validateContextListNames` (unique, `^[a-zA-Z0-9_-]+$`); resolves status via `contextStatusMap.get(context.name)` (not parallel-list index) because `dependsOnContexts` can insert names absent from `contextList`
- Cross-lump `dependsOnContexts`: composite `lumpName/contextName`; CLI `makeGitCommitMessageFnFromLumpName` maps `/` in dependency refs to `LUMP:<referencedLump> - <contextName>` — slash only for dependency refs, not same-lump context names
