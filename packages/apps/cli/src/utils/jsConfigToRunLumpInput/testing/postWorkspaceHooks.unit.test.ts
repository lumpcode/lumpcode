import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { PostSetupWorkspaceFnInput } from '../../../types/PostSetupWorkspaceFnInput';
import { atDirectory } from '../../atDirectory';
import {
    assertFailure,
    assertSuccess,
    LOCAL_CONFIG_PATH,
    resolveJsConf,
    resolveWithFixtures,
} from './testHelpers';

const setupCall = {
    baseBranch: 'main',
    branchName: 'lump/foo/ctx',
    contextList: [{ name: 'ctx', variables: {} }],
};

describe('jsConfigToRunLumpInput post workspace hooks', () => {
    it('wraps postSetupWorkspaceCommand after the built-in setup command', async () => {
        const data = assertSuccess(
            await resolveJsConf(
                { postSetupWorkspaceCommand: 'npm i' },
                { executionWorkspacePath: '/wkspace' },
            ),
        );

        const setupOut = await data.setupWorkspaceFn!(setupCall);
        expect(setupOut.workspacePath).toBe(path.resolve('/wkspace'));
        expect(setupOut.command).toContain(`git switch -c`);
        expect(setupOut.command.endsWith(` && ${atDirectory(path.resolve('/wkspace'), 'npm i')}`)).toBe(
            true,
        );
    });

    it('resolves postSetupWorkspaceFn from FilePath', async () => {
        const data = assertSuccess(
            await resolveWithFixtures({
                postSetupWorkspaceFn: path.join(LOCAL_CONFIG_PATH, 'hooks', 'postSetupWorkspace.js'),
            }),
        );

        const setupOut = await data.setupWorkspaceFn!(setupCall);
        expect(setupOut.command).toContain(atDirectory(path.resolve('/tmp/project'), 'npm ci'));
    });

    it('invokes an inline postSetupWorkspaceFn with projectRoot, execution path, strategy, and lumpVariables', async () => {
        const hookInputs: PostSetupWorkspaceFnInput[] = [];
        const data = assertSuccess(
            await resolveJsConf(
                {
                    lumpVariables: { env: 'test' },
                    postSetupWorkspaceFn: async (input) => {
                        hookInputs.push(input);
                        return { command: 'npm i' };
                    },
                },
                { executionWorkspacePath: '/wkspace', workspaceStrategy: 'worktree' },
            ),
        );

        const setupOut = await data.setupWorkspaceFn!(setupCall);
        const expectedWorkspace = path.join(
            path.resolve('/wkspace'),
            '.lumpcode',
            'worktrees',
            'lump',
            'foo',
            'ctx',
        );

        expect(setupOut.workspacePath).toBe(expectedWorkspace);
        expect(hookInputs).toHaveLength(1);
        expect(hookInputs[0]).toMatchObject({
            ...setupCall,
            workspacePath: expectedWorkspace,
            executionWorkspacePath: path.resolve('/wkspace'),
            workspaceStrategy: 'worktree',
            projectRoot: '/tmp/project',
            lumpVariables: { env: 'test' },
        });
    });

    it('fails when postSetupWorkspaceFn and postSetupWorkspaceCommand are both set', async () => {
        const result = await resolveJsConf({
            postSetupWorkspaceFn: async () => ({ command: 'npm i' }),
            postSetupWorkspaceCommand: 'npm i',
        });
        assertFailure(result, 'postSetupWorkspaceFn and postSetupWorkspaceCommand are mutually exclusive');
    });

    it('fails when postTeardownWorkspaceFn and postTeardownWorkspaceCommand are both set', async () => {
        const result = await resolveJsConf({
            postTeardownWorkspaceFn: async () => ({ command: 'true' }),
            postTeardownWorkspaceCommand: 'true',
        });
        assertFailure(
            result,
            'postTeardownWorkspaceFn and postTeardownWorkspaceCommand are mutually exclusive',
        );
    });

    it('skipPostWorkspaceHooks leaves built-in setup uncomposed', async () => {
        const data = assertSuccess(
            await resolveJsConf(
                { postSetupWorkspaceCommand: 'npm i' },
                { executionWorkspacePath: '/wkspace', skipPostWorkspaceHooks: true },
            ),
        );

        const setupOut = await data.setupWorkspaceFn!(setupCall);
        expect(setupOut.command).not.toContain('npm i');
        expect(setupOut.command).toContain(`git switch -c`);
    });

    it('resolves postTeardownWorkspaceFn from FilePath', async () => {
        const data = assertSuccess(
            await resolveWithFixtures({
                postTeardownWorkspaceFn: path.join(
                    LOCAL_CONFIG_PATH,
                    'hooks',
                    'postTeardownWorkspace.js',
                ),
            }),
        );

        expect(typeof data.teardownWorkspaceFn).toBe('function');
    });
});
