# createLumpWorkBranch

## Problem / repeated pattern

Unit tests and one e2e helper build the same git fixture: from `main`, create `lump/<lumpName>/<contextName>`, make an empty commit, optionally push it to `origin`, and switch back to `main`. The branch name is always `lumpBranchName({ lumpName, contextList: [{ name: contextName }] })` (`lump/<lumpName>/<contextName>`). The copies differ only by the commit subject (`lump work`, a lump marker message, `seed`, or a subject plus body) and by whether the branch is pushed.

That sequence is copied as local functions:

- `packages/apps/cli/src/utils/runLumpFromLumpName/unit.test.ts:62-69` — `createAndPushLumpBranch` (subject `lump work`, push, return to `main`)
- `packages/apps/cli/src/utils/runLumpFromJsConfig/unit.test.ts:98-113` — `createAndPushLumpBranch` and `createLocalOnlyLumpBranch` (same steps; the local-only copy skips the push)
- `packages/apps/cli/src/utils/countOpenLumpBranches/unit.test.ts:22-35` — the same pair (these two locals leave HEAD on the new branch; every caller then runs `execGit('checkout main', projectRoot)` before asserting)
- `packages/apps/cli/src/commands/clean/unit.test.ts:48-58` — `setupLumpBranch` (subject is `getGitCommitMessage`, optional push, returns the branch name)
- `packages/apps/cli/src/utils/planLumpFromJsConfig/unit.test.ts:294-301` — inline `makeOpen`
- `packages/apps/cli/src/utils/buildContextStatusRecord/unit.test.ts:40-43`, `:86-88`, `:108-116`, `:126-132` — the same checkout / empty commit / push steps, with marker subjects or a second `-m` body
- `packages/apps/cli/src/e2e/harness/gitHelpers.ts:52-63` — `seedRemoteLumpBranch` (subject `seed`)

## Classification

test helper — every call site is a unit test or e2e harness. No production caller.

Target file(s):

- test helper (shared): `packages/apps/cli/src/testing/createLumpWorkBranch.ts` (+ export in `testing/index.ts`)

## Fully typed definition

```typescript
import { shellSingleQuote } from '@lumpcode/core';

import { execGit, getGitCommitMessage, lumpBranchName } from '../utils';

/**
 * From `main`, create `lump/<lumpName>/<contextName>` with an empty commit.
 * Pushes to `origin` and checks `main` back out unless told not to.
 * Returns the branch name.
 */
export function createLumpWorkBranch(input: {
    projectRoot: string;
    lumpName: string;
    contextName: string;
    /**
     * Commit subject. Default `lump work`.
     * Ignored when `useMarkerMessage` is true.
     */
    message?: string;
    /** When true, subject is `getGitCommitMessage({ lumpName, contextName })`. */
    useMarkerMessage?: boolean;
    /** Second `git commit -m` argument (commit body). */
    commitBody?: string;
    /** Push the new branch to `origin`. Default true. */
    push?: boolean;
    /** `git checkout main` after the branch exists. Default true. */
    checkoutMain?: boolean;
}): string {
    const {
        projectRoot,
        lumpName,
        contextName,
        message = 'lump work',
        useMarkerMessage = false,
        commitBody,
        push = true,
        checkoutMain = true,
    } = input;
    const branch = lumpBranchName({ lumpName, contextList: [{ name: contextName }] });
    const subject = useMarkerMessage
        ? getGitCommitMessage({ lumpName, contextName })
        : message;
    const commitCmd =
        commitBody === undefined
            ? `commit --allow-empty -m ${shellSingleQuote(subject)}`
            : `commit --allow-empty -m ${shellSingleQuote(subject)} -m ${shellSingleQuote(commitBody)}`;

    execGit('checkout main', projectRoot);
    execGit(`checkout -b ${shellSingleQuote(branch)}`, projectRoot);
    execGit(commitCmd, projectRoot);
    if (push) {
        execGit(`push origin ${shellSingleQuote(branch)}`, projectRoot);
    }
    if (checkoutMain) {
        execGit('checkout main', projectRoot);
    }
    return branch;
}
```

`shellSingleQuote` keeps subjects that contain spaces (marker messages, `PR title`) as one commit argument. Quoted branch names match today's unquoted `lump/...` names for every current caller.

## Before -> after example

```typescript
// Before (packages/apps/cli/src/utils/runLumpFromJsConfig/unit.test.ts)
function createAndPushLumpBranch(lumpName: string, contextName: string) {
    const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
    execGit('checkout main', projectRoot);
    execGit(`checkout -b ${branch}`, projectRoot);
    execGit(`commit --allow-empty -m "lump work"`, projectRoot);
    execGit(`push origin ${branch}`, projectRoot);
    execGit('checkout main', projectRoot);
}

function createLocalOnlyLumpBranch(lumpName: string, contextName: string) {
    const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
    execGit('checkout main', projectRoot);
    execGit(`checkout -b ${branch}`, projectRoot);
    execGit(`commit --allow-empty -m "lump work"`, projectRoot);
    execGit('checkout main', projectRoot);
}

createAndPushLumpBranch('my-lump', 'ctx-a');
createLocalOnlyLumpBranch('my-lump', 'ctx-a');

// After
createLumpWorkBranch({ projectRoot, lumpName: 'my-lump', contextName: 'ctx-a' });
createLumpWorkBranch({
    projectRoot,
    lumpName: 'my-lump',
    contextName: 'ctx-a',
    push: false,
});
```

## Affected call sites

- `packages/apps/cli/src/utils/runLumpFromLumpName/unit.test.ts:62-69` — delete `createAndPushLumpBranch`. Calls at `:87-88` and `:223-224` become `createLumpWorkBranch({ projectRoot, lumpName: 'my-lump', contextName })` (default subject, push, and checkout `main`).
- `packages/apps/cli/src/utils/runLumpFromJsConfig/unit.test.ts:98-113` — delete both locals. `createAndPushLumpBranch(...)` calls (`:116-117`, `:132-134`, `:145`, `:188-190`, `:284-285`, `:301-302`, `:471-472`, `:711-712`, `:737-738`, `:762-763`) use the default. `createLocalOnlyLumpBranch(...)` at `:166-167` passes `push: false`.
- `packages/apps/cli/src/utils/countOpenLumpBranches/unit.test.ts:22-35` — delete both locals. Push calls at `:43-44`, `:67-69`, and `:77` use the default. `:52` passes `push: false`. Delete the now-redundant `execGit('checkout main', projectRoot)` at `:45`, `:53`, `:70`, and `:78` (the helper already returns to `main`).
- `packages/apps/cli/src/utils/planLumpFromJsConfig/unit.test.ts:294-301` — delete `makeOpen`. `makeOpen('ctx-a')` / `makeOpen('ctx-b')` become `createLumpWorkBranch({ projectRoot, lumpName: 'preview-lump', contextName: 'ctx-a' })` (and `ctx-b`).
- `packages/apps/cli/src/commands/clean/unit.test.ts:48-58` — delete `setupLumpBranch`. Calls at `:62-63`, `:82-83`, `:124-125`, `:192`, `:200`, `:213`, and `:230` become `createLumpWorkBranch({ projectRoot, lumpName, contextName, useMarkerMessage: true })`. `:109` also passes `push: false`.
- `packages/apps/cli/src/commands/clean/unit.test.ts:141-148` — the inline subject-plus-body commit becomes `createLumpWorkBranch({ projectRoot, lumpName: 'myLump', contextName: 'button', message: 'PR title', commitBody: `* ${message}` })`, using the returned branch name in the later `toContain` assertion.
- `packages/apps/cli/src/utils/buildContextStatusRecord/unit.test.ts:40-43` — replace with `createLumpWorkBranch({ projectRoot: tmpDir, lumpName, contextName: 'button', useMarkerMessage: true })` and use the returned branch in the expected record.
- `packages/apps/cli/src/utils/buildContextStatusRecord/unit.test.ts:86-88` — same helper for `contextName: 'card'` and `useMarkerMessage: true`. Leave the following merge onto `main` (`:90-96`) inline.
- `packages/apps/cli/src/utils/buildContextStatusRecord/unit.test.ts:108-116` — two helper calls (`myLump`/`button` and `otherLump`/`form`, each `useMarkerMessage: true`).
- `packages/apps/cli/src/utils/buildContextStatusRecord/unit.test.ts:126-132` — `createLumpWorkBranch({ projectRoot: tmpDir, lumpName, contextName: 'batch', message: 'PR title', commitBody: `* ${commitMsg('button')}, ${commitMsg('form')}` })`.
- `packages/apps/cli/src/e2e/harness/gitHelpers.ts:52-63` — delete `seedRemoteLumpBranch`. `packages/apps/cli/src/e2e/run-scenarios.test.ts:166` calls `createLumpWorkBranch({ projectRoot: project.projectRoot, lumpName, contextName: 'seeded', message: 'seed' })`.

## Estimated lines saved

~85 lines removed across the local functions, inline sequences, and the e2e helper, ~50 added (`createLumpWorkBranch.ts` plus the `testing/index.ts` export and new imports) → ~35 net saved. No test file for the helper.

## Non-goals

- No production callers and no new `utils/` module. `gitCommitAllAndPush` stays the production empty-commit helper.
- Do not fold in commits that stay on the current branch (`seedFinishedContextOnMain`, the cross-lump marker commit in `setContextToFinishedStatus/unit.test.ts`).
- Do not fold in non-lump branch names or merge/delete sequences: `buildContextStatusRecord/unit.test.ts:58-64` (`temp-branch` merged into `main`) and `:72-75` (`local-only`), `runProjectPreflight/unit.test.ts:104-107` (`ver/0.0.9`), or `createIntegrationBranch`.
- Behavior-preserving for the listed sites: same branch name, empty commit, push default, and final `HEAD` of `main`. Quoting the branch and subject must not change the commit message those tests assert.
- No changes outside `packages/apps/cli`.

## Acceptance criteria

- [ ] New file at `packages/apps/cli/src/testing/createLumpWorkBranch.ts`, re-exported from `packages/apps/cli/src/testing/index.ts`
- [ ] All listed call sites refactored to use it; local copies and `seedRemoteLumpBranch` removed
- [ ] Meaningful net line reduction across call sites (excluding any test file for this helper)
- [ ] `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` pass; only `packages/apps/cli` touched
