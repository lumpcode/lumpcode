import {
    execAsync,
    GIT_LOG_HASH_BODY_FORMAT,
    parseGitLogHashBodyRecords,
    shellSingleQuote,
} from '@lumpcode/core';

import { contextNamesAfterLumpPrefix } from '../contextNamesAfterLumpPrefix';
import { getLumpCommitPrefixForLump } from '../getGitCommitMessage';
import {
    isNonLumpRemoteTrackingRef,
    isReachableFromNonLumpRemoteHead,
} from '../isReachableFromNonLumpRemoteHead';
import { lumpBranchGlob } from '../lumpBranchGlob';
import { listRemoteHeadRefs } from '../listRemoteHeadBranches';

/**
 * Counts remote `lump/<lumpName>/*` heads that are still open.
 *
 * A branch on `origin` (`refs/heads/lump/<lumpName>/*`) does not count when
 * either of these is true:
 *
 * - Its tip is reachable from a local `refs/remotes/origin/` ref whose branch
 *   name does not start with `lump/` (merge commit or fast-forward; see
 *   `isReachableFromNonLumpRemoteHead`). This is the fallback when the branch
 *   carries no `LUMP: <lumpName> - <contextName>` line.
 * - It carries at least one such line, and every one of those lines is already
 *   in a commit reachable from a non-lump origin ref (squash or rebase that
 *   kept the lines, including a later commit that adds no new line).
 *
 * A branch with no line for this lump, a line that is missing from every
 * non-lump origin ref, a missing tip object, or any git error during the
 * check still counts as open. Local-only branches are ignored. The check
 * reads remote-tracking refs already in the clone and does not fetch.
 *
 * If `git ls-remote` fails (e.g. no `origin`, network error), returns 0.
 */
export async function countOpenLumpBranches(input: {
    /** Execution workspace (git repo root): project copy in shared mode, checkout in dedicated. */
    executionWorkspacePath: string;
    lumpName: string;
}): Promise<number> {
    const { executionWorkspacePath, lumpName } = input;
    const branchGlob = lumpBranchGlob({ lumpName });
    const shortNamePrefix = branchGlob.slice(0, -1);
    const listed = await listRemoteHeadRefs({
        cwd: executionWorkspacePath,
        branchGlob,
        postFilterBranchShortName: (shortName) => shortName.startsWith(shortNamePrefix),
    });
    if (!listed.success) return 0;

    const lumpPrefix = getLumpCommitPrefixForLump({ lumpName });
    let landedNames: Set<string> | null | undefined;

    let openBranchCount = 0;
    for (const ref of listed.data) {
        const tipLanded = await isReachableFromNonLumpRemoteHead({
            cwd: executionWorkspacePath,
            commitHash: ref.commitHash,
        });
        if (tipLanded) continue;

        const carried = await contextNamesInRevList({
            cwd: executionWorkspacePath,
            lumpPrefix,
            revs: [ref.commitHash],
        });
        if (carried === null || carried.size === 0) {
            openBranchCount += 1;
            continue;
        }

        if (landedNames === undefined) {
            landedNames = await contextNamesOnNonLumpOriginHeads({
                cwd: executionWorkspacePath,
                lumpPrefix,
            });
        }
        if (landedNames === null || !everyNameLanded(carried, landedNames)) {
            openBranchCount += 1;
        }
    }
    return openBranchCount;
}

function everyNameLanded(carried: Set<string>, landed: Set<string>): boolean {
    for (const name of carried) {
        if (!landed.has(name)) return false;
    }
    return true;
}

/** `null` when the rev list cannot be read. An empty rev list is an empty set. */
async function contextNamesInRevList(input: {
    cwd: string;
    lumpPrefix: string;
    revs: string[];
}): Promise<Set<string> | null> {
    const { cwd, lumpPrefix, revs } = input;
    if (revs.length === 0) return new Set();
    try {
        const revArgs = revs.map((rev) => shellSingleQuote(rev)).join(' ');
        const result = await execAsync(
            `git log -F --grep=${shellSingleQuote(lumpPrefix)} --format=${shellSingleQuote(GIT_LOG_HASH_BODY_FORMAT)} ${revArgs}`,
            { cwd },
        );
        if (!result.success) return null;
        const names = new Set<string>();
        for (const { message } of parseGitLogHashBodyRecords(result.data.stdout)) {
            for (const name of contextNamesAfterLumpPrefix(message, lumpPrefix)) {
                names.add(name);
            }
        }
        return names;
    } catch {
        return null;
    }
}

/** `null` when origin heads cannot be listed or their history cannot be read. */
async function contextNamesOnNonLumpOriginHeads(input: {
    cwd: string;
    lumpPrefix: string;
}): Promise<Set<string> | null> {
    const { cwd, lumpPrefix } = input;
    let heads: string[];
    try {
        const result = await execAsync(
            `git for-each-ref --format=${shellSingleQuote('%(refname:short)')} refs/remotes/origin`,
            { cwd },
        );
        if (!result.success) return null;
        heads = result.data.stdout
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && isNonLumpRemoteTrackingRef(line));
    } catch {
        return null;
    }
    return contextNamesInRevList({ cwd, lumpPrefix, revs: heads });
}
