import type { LumpVariables, SetupWorkspaceFn, TeardownWorkspaceFn } from '@lumpcode/core';
import { execAsync } from '@lumpcode/core';

import type { PostSetupWorkspaceFn } from '../../types/PostSetupWorkspaceFn';
import type { PostSetupWorkspaceFnInput } from '../../types/PostSetupWorkspaceFnInput';
import type { PostTeardownWorkspaceFn } from '../../types/PostTeardownWorkspaceFn';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { atDirectory } from '../atDirectory';

export type ComposeLumpWorkspaceFnsInput<V extends LumpVariables = LumpVariables> = {
    setupWorkspaceFn: SetupWorkspaceFn;
    teardownWorkspaceFn: TeardownWorkspaceFn;
    postSetupWorkspaceFn?: PostSetupWorkspaceFn<V>;
    postTeardownWorkspaceFn?: PostTeardownWorkspaceFn<V>;
    executionWorkspacePath: string;
    workspaceStrategy: WorkspaceStrategy;
    projectRoot: string;
    lumpVariables: V;
};

export type ComposeLumpWorkspaceFnsOutput = {
    setupWorkspaceFn: SetupWorkspaceFn;
    teardownWorkspaceFn: TeardownWorkspaceFn;
};

function userCommandFromResult(result: { command?: string } | void): string | undefined {
    const command = result?.command;
    if (typeof command !== 'string' || !command.trim()) {
        return undefined;
    }
    return command;
}

export function composeLumpWorkspaceFns<V extends LumpVariables = LumpVariables>(
    input: ComposeLumpWorkspaceFnsInput<V>,
): ComposeLumpWorkspaceFnsOutput {
    const {
        setupWorkspaceFn: builtInSetup,
        teardownWorkspaceFn: builtInTeardown,
        postSetupWorkspaceFn,
        postTeardownWorkspaceFn,
        executionWorkspacePath,
        workspaceStrategy,
        projectRoot,
        lumpVariables,
    } = input;

    if (!postSetupWorkspaceFn && !postTeardownWorkspaceFn) {
        return {
            setupWorkspaceFn: builtInSetup,
            teardownWorkspaceFn: builtInTeardown,
        };
    }

    const hookBag = (
        workspacePath: string,
        base: { baseBranch: string; branchName: string; contextList: PostSetupWorkspaceFnInput['contextList'] },
    ): PostSetupWorkspaceFnInput<V> => ({
        baseBranch: base.baseBranch,
        branchName: base.branchName,
        contextList: base.contextList,
        workspacePath,
        executionWorkspacePath,
        workspaceStrategy,
        projectRoot,
        lumpVariables,
    });

    const setupWorkspaceFn: SetupWorkspaceFn = async (setupInput) => {
        const builtIn = await builtInSetup(setupInput);
        if (!postSetupWorkspaceFn) {
            return builtIn;
        }

        const hookResult = await postSetupWorkspaceFn(
            hookBag(builtIn.workspacePath, setupInput),
        );
        const userCommand = userCommandFromResult(hookResult);
        if (!userCommand) {
            return builtIn;
        }

        const wrapped = atDirectory(builtIn.workspacePath, userCommand);
        return {
            command: builtIn.command ? `${builtIn.command} && ${wrapped}` : wrapped,
            workspacePath: builtIn.workspacePath,
            afterExec: builtIn.afterExec,
        };
    };

    const teardownWorkspaceFn: TeardownWorkspaceFn = async (teardownInput) => {
        if (!postTeardownWorkspaceFn) {
            return builtInTeardown(teardownInput);
        }

        const hookResult = await postTeardownWorkspaceFn(hookBag(teardownInput.workspacePath, teardownInput));
        const userCommand = userCommandFromResult(hookResult);

        let userFailure: Error | undefined;
        if (userCommand) {
            const execResult = await execAsync(userCommand, { cwd: teardownInput.workspacePath });
            if (!execResult.success) {
                userFailure = new Error(execResult.data.message);
            }
        }

        const builtInCommand = await builtInTeardown(teardownInput);
        if (userFailure) {
            throw userFailure;
        }
        return builtInCommand;
    };

    return { setupWorkspaceFn, teardownWorkspaceFn };
}
