import { execAsync, shellSingleQuote } from '@lumpcode/core';

import { LUMP_BRANCH_PREFIX } from '../../consts';

/**
 * Remote-tracking head whose branch is outside `lump/`
 * (`origin/main`, `origin/HEAD`, `upstream/dev`).
 * A name with no `/` is false.
 */
export function isNonLumpRemoteTrackingRef(refShortName: string): boolean {
    const slash = refShortName.indexOf('/');
    if (slash === -1) return false;
    return !refShortName.slice(slash + 1).startsWith(LUMP_BRANCH_PREFIX);
}

/**
 * True when `commitHash` is contained in at least one local `refs/remotes/origin/`
 * ref whose branch name does not start with `lump/`.
 *
 * This is the merged rule for the open-branch cap: a merge commit or fast-forward
 * onto `origin/main`, `origin/dev`, `origin/feature/x`, or `origin/HEAD` counts.
 * A tip contained only by `origin/lump/...` does not. A missing object, a squash
 * or rebase merge, or any git failure returns false. Never throws.
 */
export async function isReachableFromNonLumpRemoteHead(input: {
    cwd: string;
    commitHash: string;
}): Promise<boolean> {
    const { cwd, commitHash } = input;
    try {
        const result = await execAsync(
            `git for-each-ref --contains ${shellSingleQuote(commitHash)} --format=${shellSingleQuote('%(refname:short)')} refs/remotes/origin`,
            { cwd },
        );
        if (!result.success) return false;
        const refs = result.data.stdout
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => line.trim());
        return refs.some(isNonLumpRemoteTrackingRef);
    } catch {
        return false;
    }
}
