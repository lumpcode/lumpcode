import {
    defaultGitAddCommandFn,
    defaultGitCommitCommandFn,
    defaultGitPushCommandFn,
    execAsync,
    shellSingleQuote,
    type GitAddCommandFn,
    type GitCommitCommandFn,
    type GitPushCommandFn,
} from '@lumpcode/core';

import {
    type GitCommonDirLockContext,
    withGitCommonDirLock,
} from '../gitCommonDirLock';

/**
 * CLI-owned git injectors: no-op add; locked add+commit in commit fn; locked push.
 * Return undefined so core skips execAsync (work already done). Throw on failure.
 */
export function makeGatedGitCommandFns(input: {
    gitLock: GitCommonDirLockContext;
}): {
    gitAddCommandFn: GitAddCommandFn;
    gitCommitCommandFn: GitCommitCommandFn;
    gitPushCommandFn: GitPushCommandFn;
} {
    const { gitLock } = input;

    const gitAddCommandFn: GitAddCommandFn = async () => undefined;

    const gitCommitCommandFn: GitCommitCommandFn = async (fnInput) => {
        const addCmd = await defaultGitAddCommandFn(fnInput);
        const commitCmd = await defaultGitCommitCommandFn(fnInput);
        if (addCmd == null || commitCmd == null) {
            throw new Error('default git add/commit command fn returned empty');
        }
        const locked = await withGitCommonDirLock({
            lock: { ...gitLock, gitCwd: fnInput.workspacePath },
            fn: async () => {
                const addResult = await execAsync(addCmd, { cwd: fnInput.workspacePath });
                if (!addResult.success) {
                    throw new Error(addResult.data.message);
                }
                const commitResult = await execAsync(commitCmd, { cwd: fnInput.workspacePath });
                if (!commitResult.success) {
                    throw new Error(commitResult.data.message);
                }
            },
        });
        if (!locked.success) {
            throw new Error(typeof locked.data === 'string' ? locked.data : locked.data.message);
        }
        return undefined;
    };

    const gitPushCommandFn: GitPushCommandFn = async (fnInput) => {
        const pushCmd =
            (await defaultGitPushCommandFn(fnInput)) ??
            `git push origin ${shellSingleQuote(fnInput.branchName)}`;
        const locked = await withGitCommonDirLock({
            lock: { ...gitLock, gitCwd: fnInput.workspacePath },
            fn: async () => {
                const pushResult = await execAsync(pushCmd, { cwd: fnInput.workspacePath });
                if (!pushResult.success) {
                    throw new Error(pushResult.data.message);
                }
            },
        });
        if (!locked.success) {
            throw new Error(typeof locked.data === 'string' ? locked.data : locked.data.message);
        }
        return undefined;
    };

    return { gitAddCommandFn, gitCommitCommandFn, gitPushCommandFn };
}
