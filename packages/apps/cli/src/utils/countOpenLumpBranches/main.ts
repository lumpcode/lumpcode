import { isReachableFromNonLumpRemoteHead } from '../isReachableFromNonLumpRemoteHead';
import { lumpBranchGlob } from '../lumpBranchGlob';
import { listRemoteHeadRefs } from '../listRemoteHeadBranches';

/**
 * Counts remote `lump/<lumpName>/*` heads that are not merged yet.
 *
 * A branch counts as open when it exists on `origin`
 * (`refs/heads/lump/<lumpName>/*`) and its tip is not reachable from any
 * local `refs/remotes/origin/` ref whose branch name does not start with
 * `lump/` (see `isReachableFromNonLumpRemoteHead`). A merge commit or
 * fast-forward onto such a ref does not count. A missing tip object, a
 * squash or rebase merge, or any git error during the reachability check
 * still counts as open. Local-only branches are ignored. The check reads
 * remote-tracking refs already in the clone and does not fetch.
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

    let openBranchCount = 0;
    for (const ref of listed.data) {
        const merged = await isReachableFromNonLumpRemoteHead({
            cwd: executionWorkspacePath,
            commitHash: ref.commitHash,
        });
        if (!merged) openBranchCount += 1;
    }
    return openBranchCount;
}
