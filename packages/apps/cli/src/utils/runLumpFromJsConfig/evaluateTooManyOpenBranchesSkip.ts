import type { LumpJsConfig } from '../../types';
import type { Mode } from '../../types/Mode';
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
    mode: Mode;
}): Promise<TooManyOpenBranchesSkip | null> {
    const { jsConfig, lumpName, executionWorkspacePath, mode } = input;
    if (mode === 'shared') {
        return null;
    }

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
