import { lumpBranchGlob } from '../lumpBranchGlob';
import { listRemoteHeadBranches } from '../listRemoteHeadBranches';

/**
 * Counts the distinct branches opened for a given lump on the remote.
 *
 * A branch is considered "opened" when it exists on `origin`
 * (`refs/heads/lump/<lumpName>/*`). Local-only branches are ignored;
 * the remote is the single source of truth for open lump work.
 *
 * If the remote query fails (e.g. no `origin`, network error), returns 0.
 */
export async function countOpenLumpBranches(input: {
    /** Execution workspace (git repo root): project copy in shared mode, checkout in dedicated. */
    executionWorkspacePath: string;
    lumpName: string;
}): Promise<number> {
    const { executionWorkspacePath, lumpName } = input;
    const branchGlob = lumpBranchGlob({ lumpName });
    const shortNamePrefix = branchGlob.slice(0, -1);
    const listed = await listRemoteHeadBranches({
        cwd: executionWorkspacePath,
        branchGlob,
        postFilterBranchShortName: (shortName) => shortName.startsWith(shortNamePrefix),
    });
    return listed.success ? listed.data.length : 0;
}
