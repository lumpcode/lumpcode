import {
    execAsync,
    failure,
    shellSingleQuote,
    success,
    type ExecAsyncFailure,
    type Failure,
    type Success,
} from '@lumpcode/core';

import { getGitCommitMessage } from '../getGitCommitMessage';

export type CommitSharedRunReviewFailure = {
    code: 'sharedRunCommitFailed';
    message: string;
};

function gitExecFailureMessage(execFailure: ExecAsyncFailure): string {
    const raw = execFailure.info.stderr;
    if (typeof raw === 'object' && raw !== null && 'stderr' in raw) {
        const stderr = String((raw as { stderr?: unknown }).stderr ?? '').trim();
        if (stderr.length > 0) {
            return stderr;
        }
    }
    return execFailure.message;
}

/**
 * One `git add .` + `--allow-empty` commit at `cwd` with every context marker.
 * No push. Failure `sharedRunCommitFailed` carries git stderr.
 */
export async function commitSharedRunReview(input: {
    cwd: string;
    lumpName: string;
    contextNames: string[];
}): Promise<Success<void> | Failure<CommitSharedRunReviewFailure>> {
    const { cwd, lumpName, contextNames } = input;
    const commitMessage = contextNames
        .map((contextName) => getGitCommitMessage({ lumpName, contextName }))
        .join('\n\n');
    const command = `git add . && git commit --allow-empty -m ${shellSingleQuote(commitMessage)}`;
    const result = await execAsync(command, { cwd });
    if (!result.success) {
        return failure<CommitSharedRunReviewFailure>({
            code: 'sharedRunCommitFailed',
            message: gitExecFailureMessage(result.data),
        });
    }
    return success(undefined);
}
