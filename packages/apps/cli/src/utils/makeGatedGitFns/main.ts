import {
    execAsync,
    failure,
    shellSingleQuote,
    success,
    type Failure,
    type GitAddCommitFn,
    type GitPushFn,
    type Success,
} from '@lumpcode/core';

import {
    type GitCommonDirLockContext,
    withGitCommonDirLock,
} from '../gitCommonDirLock';

/**
 * CLI-owned git injectors: locked add+commit and push.
 * Return `success(undefined)` so core skips execAsync (work already done).
 * Supported path returns `failure(msg)` — no throws.
 */
export function makeGatedGitFns(input: {
    gitLock: GitCommonDirLockContext;
}): {
    gitAddCommitFn: GitAddCommitFn;
    gitPushFn: GitPushFn;
} {
    const { gitLock } = input;

    const gitAddCommitFn: GitAddCommitFn = async (fnInput) => {
        const addCmd = 'git add .';
        const commitCmd =
            `git commit --allow-empty -m ${shellSingleQuote(fnInput.commitMessage)}`;
        const locked = await withGitCommonDirLock({
            lock: { ...gitLock, gitCwd: fnInput.workspacePath },
            fn: async (): Promise<Success<undefined> | Failure<string>> => {
                const addResult = await execAsync(addCmd, { cwd: fnInput.workspacePath });
                if (!addResult.success) {
                    return failure(addResult.data.message);
                }
                const commitResult = await execAsync(commitCmd, { cwd: fnInput.workspacePath });
                if (!commitResult.success) {
                    return failure(commitResult.data.message);
                }
                return success(undefined);
            },
        });
        if (!locked.success) {
            return failure(
                typeof locked.data === 'string' ? locked.data : locked.data.message,
            );
        }
        return locked.data;
    };

    const gitPushFn: GitPushFn = async (fnInput) => {
        const pushCmd = `git push origin ${shellSingleQuote(fnInput.branchName)}`;
        const locked = await withGitCommonDirLock({
            lock: { ...gitLock, gitCwd: fnInput.workspacePath },
            fn: async (): Promise<Success<undefined> | Failure<string>> => {
                const pushResult = await execAsync(pushCmd, { cwd: fnInput.workspacePath });
                if (!pushResult.success) {
                    return failure(pushResult.data.message);
                }
                return success(undefined);
            },
        });
        if (!locked.success) {
            return failure(
                typeof locked.data === 'string' ? locked.data : locked.data.message,
            );
        }
        return locked.data;
    };

    return { gitAddCommitFn, gitPushFn };
}
