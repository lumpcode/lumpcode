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
