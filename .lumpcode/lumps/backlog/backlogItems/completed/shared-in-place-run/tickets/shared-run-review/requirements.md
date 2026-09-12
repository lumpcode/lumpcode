# Requirements: shared run review (commit / exit)

| Field | Value |
| --- | --- |
| **Backlog** | `shared-run-review` · parent `shared-in-place-run` · priority **1** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `in-place-workspace` (walk already no-ops git; files stay dirty) |
| **Packages** | Primary `@lumpcode/cli` (`commands/run` + review utils). `@lumpcode/core` unchanged. No docs ticket work. |

Umbrella: [parent requirements](../../requirements.md).

## Problem statement and motivation

The shared walk leaves a dirty tree and never commits. Authors need a LUMP-marker commit when the updates look valid, and a way to leave without committing so they can edit the lump and `lumpcode run` again.

## Goals

1. After a successful shared walk that executed at least one context, `commands/run` offers `c` (commit) or `e` (exit).
2. `c` is one `git add .` + `--allow-empty` commit with every walked context’s existing marker. No push.
3. Non-TTY and `--json` behave as `e` (success, no commit).
4. Phase 2 and the daemon tick never prompt.

## Non-goals

- In-process rerun. Rerun is `e` + another `lumpcode run`.
- Skipping contexts from local HEAD. Status stays remote-only.
- Changing `getGitCommitMessage` / marker strings.
- New CLI flags.
- Docs / website (later ticket).
- Prompting on skip, 0 contexts, or walk failure.

## User stories / use cases

1. As an author after a good walk — I see porcelain, type `c`, get one LUMP commit, no push. `lump-status` stays `toDo` until I push.
2. As an author after a bad walk — I type `e` or Ctrl+C, edit the lump, run again.
3. As a script — `lumpcode run --json` succeeds, does not hang, does not commit.

## Proposed behavior and UX

Call site: `commands/run` only, after `runLumpFromLumpName` success, after disposing `installRunAbortHandlers`.

`shouldPromptSharedRunReview`: `mode === 'shared'` and not `skipped` and `result.contextNames.length > 0`.

| Condition | Behavior |
| --- | --- |
| TTY and not `--json` | Porcelain, then `[c]` / `[e]` |
| `!stdin.isTTY` or `--json` | `success('exit')` — no prompt, no porcelain dump |
| Predicate false | No prompt |

| Input | Effect |
| --- | --- |
| `c` / `C` | `commitSharedRunReview` |
| `e` / `E` | Success, leave dirty |
| Other keys | Re-print the menu |
| Ctrl+C or EOF | Same as `e` (success, not exit 130) |

TTY copy:

```text
These changes will be committed if you choose c:
<porcelain lines>

Verify the updates.
  [c] Commit with the LUMP marker (does not push)
  [e] Exit without committing — edit the lump and run again
```

`commitSharedRunReview`: `git add . && git commit --allow-empty -m <message>` at `cwd` (project root). Message = `getGitCommitMessage({ lumpName, contextName })` for each `contextNames` entry, joined by `\n\n`.

After successful `c`, print then SUCCESS:

```text
Committed LUMP markers for: <comma-separated contextNames>
Contexts stay toDo until you push this branch. The next lumpcode run will pick them again.
```

| `data.code` | When | Message |
| --- | --- | --- |
| `sharedRunCommitFailed` | git add/commit fails | git stderr (or one-liner plus stderr) |

`sharedRunCommitFailed` is a command Failure. Do not print SUCCESS. Leave the tree as git left it.

`e` and implicit-exit: `SUCCESS: Lump run successfully`.

## Technical approach

| Concern | Owner | Non-owners |
| --- | --- | --- |
| Predicate | `packages/apps/cli/src/utils/shouldPromptSharedRunReview/` | Inline elsewhere |
| Prompt | `packages/apps/cli/src/utils/promptSharedRunReview/` | `runLumpFromJsConfig`, `runLumpFromLumpName`, `runForeground` |
| Commit | `packages/apps/cli/src/utils/commitSharedRunReview/` | Core, other commands |
| Wire-up | `commands/run` | Phase 1 / phase 2 |

```ts
type SharedRunReviewChoice = 'commit' | 'exit';

function shouldPromptSharedRunReview(input: {
  mode: 'shared' | 'dedicated';
  run: RunLumpFromLumpNameSuccess;
}): boolean;

function promptSharedRunReview(input: {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  json: boolean;
  porcelainLines: string[];
}): Promise<Success<SharedRunReviewChoice>>;

function commitSharedRunReview(input: {
  cwd: string;
  lumpName: string;
  contextNames: string[];
}): Promise<Success<void> | Failure<{ code: 'sharedRunCommitFailed'; message: string }>>;
```

`promptSharedRunReview` always returns `Success` (`commit` or `exit`). Ctrl+C / EOF → `exit`. `--json` or `!stdin.isTTY` → `exit` without reading stdin.

Do not inject TTY detection into phase 2. Tests of `runLumpFromJsConfig` stay non-interactive.

## Testing strategy

| Area | Where | Proves |
| --- | --- | --- |
| Predicate | `shouldPromptSharedRunReview/unit.test.ts` | shared+contexts; skip; 0 names; dedicated |
| Prompt | `promptSharedRunReview/unit.test.ts` | `c`/`e`; junk re-prompt; Ctrl+C/EOF; json / non-TTY → exit |
| Commit | `commitSharedRunReview/unit.test.ts` | multi-marker `%B`; `--allow-empty`; failure code; no push |
| `commands/run` | `commands/run` suite | dispose abort handlers before prompt; `c` fail is Failure; implicit exit on `--json` |
| Phase 2 | existing `runLumpFromJsConfig` suite | still no prompt, still no auto commit |

Prefer updating existing `commands/run` tests over a wholly new command file when a candidate exists.

## Acceptance criteria

1. Successful shared walk with contexts + TTY (not `--json`) shows porcelain and `c`/`e`.
2. `e` and Ctrl+C: exit 0, no commit.
3. `c`: one commit, all markers, `git add .`, no push.
4. `--json` / non-TTY: exit 0, no commit, no hang.
5. `c` + git fail: `sharedRunCommitFailed`, no SUCCESS.
6. Skip / empty `contextNames` / walk failure: no prompt.
7. `runLumpFromJsConfig` / daemon tick never call the prompt.
8. After `c` before push, contexts stay `toDo` (no local-HEAD skip).
