import type { LumpJsConfig } from '../../types';
import { countOpenLumpBranches } from '../countOpenLumpBranches';
import type { RunLumpFromJsConfigSuccess } from './main';

export type TooManyOpenBranchesSkip = Extract<
    RunLumpFromJsConfigSuccess,
    { skipped: true; reason: 'tooManyOpenBranches' }
>;

export async function evaluateTooManyOpenBranchesSkip(input: {
    jsConfig: LumpJsConfig;
    lumpName: string;
    executionWorkspacePath: string;
}): Promise<TooManyOpenBranchesSkip | null> {
    const { jsConfig, lumpName, executionWorkspacePath } = input;
    const { maximumNumberOfConcurrentBranches } = jsConfig;
    if (
        typeof maximumNumberOfConcurrentBranches !== 'number' ||
        maximumNumberOfConcurrentBranches < 0
    ) {
        return null;
    }

    const openBranchCount = await countOpenLumpBranches({
        executionWorkspacePath,
        lumpName,
    });
    if (openBranchCount < maximumNumberOfConcurrentBranches) {
        return null;
    }

    return {
        skipped: true,
        openBranchCount,
        maximumNumberOfConcurrentBranches,
        reason: 'tooManyOpenBranches',
        reasonDetail:
            `Lump "${lumpName}" has ${openBranchCount} open branch(es), ` +
            `which meets or exceeds the configured ` +
            `maximumNumberOfConcurrentBranches (${maximumNumberOfConcurrentBranches}). ` +
            `Skipping run.`,
    };
}
