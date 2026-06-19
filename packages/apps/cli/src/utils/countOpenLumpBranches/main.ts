import { execAsync, shellSingleQuote } from '@lumpcode/core';

import { REFS_HEADS_PREFIX } from '../../consts';
import { lumpBranchGlob } from '../lumpBranchGlob';

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
    const namePattern = branchGlob.endsWith('*') ? branchGlob.slice(0, -1) : branchGlob;

    const remoteRefPattern = `${REFS_HEADS_PREFIX}${branchGlob}`;
    const remoteResult = await execAsync(
        `git ls-remote --heads origin ${shellSingleQuote(remoteRefPattern)}`,
        { cwd: executionWorkspacePath },
    );

    const branches = new Set<string>();

    if (remoteResult.success) {
        for (const line of remoteResult.data.stdout.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(/\s+/);
            const ref = parts[1];
            if (!ref || !ref.startsWith(REFS_HEADS_PREFIX)) continue;
            const shortName = ref.slice(REFS_HEADS_PREFIX.length);
            if (!shortName.startsWith(namePattern)) continue;
            branches.add(shortName);
        }
    }

    return branches.size;
}
