import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { PostSetupWorkspaceFnInput } from '@lumpcode/cli-utils';
import * as core from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import { openPrPostTeardown } from './main';

vi.mock('@lumpcode/core', async () => {
    const actual = await vi.importActual<typeof core>('@lumpcode/core');
    return {
        ...actual,
        execBinary: vi.fn(),
    };
});

const execBinaryMock = vi.mocked(core.execBinary);

function hookInput(overrides: Partial<PostSetupWorkspaceFnInput> = {}): PostSetupWorkspaceFnInput {
    return {
        baseBranch: 'dev',
        branchName: 'lump/backlog/foo',
        contextList: [{ name: 'foo', variables: {} }],
        workspacePath: '/tmp/ws',
        executionWorkspacePath: '/tmp/exec',
        workspaceStrategy: 'checkout',
        projectRoot: '/tmp/project',
        lumpVariables: {},
        ...overrides,
    };
}

function execOk(stdout: string) {
    return success({ stdout, stderr: '' });
}

function execFail(message: string) {
    return failure({
        message,
        binaryPath: 'gh',
        args: [],
        reason: 'exit' as const,
    });
}

describe('openPrPostTeardown', () => {
    beforeEach(() => {
        execBinaryMock.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('skips when branchName is empty', async () => {
        const hook = openPrPostTeardown({ provider: 'github' });
        await hook(hookInput({ branchName: '' }));
        expect(execBinaryMock).not.toHaveBeenCalled();
    });

    it('skips when branchName equals baseBranch', async () => {
        const hook = openPrPostTeardown({ provider: 'github' });
        await hook(hookInput({ branchName: 'dev', baseBranch: 'dev' }));
        expect(execBinaryMock).not.toHaveBeenCalled();
    });

    it('skips when the work branch is not on origin', async () => {
        execBinaryMock.mockResolvedValue(execOk(''));
        const hook = openPrPostTeardown({ provider: 'github' });
        await hook(hookInput());
        expect(execBinaryMock).toHaveBeenCalledTimes(1);
        expect(execBinaryMock).toHaveBeenCalledWith({
            binaryPath: 'git',
            args: ['ls-remote', '--heads', 'origin', 'lump/backlog/foo'],
            cwd: '/tmp/ws',
        });
    });

    it('skips when ls-remote fails', async () => {
        execBinaryMock.mockResolvedValue(execFail('ls-remote failed'));
        const hook = openPrPostTeardown({ provider: 'github' });
        await expect(hook(hookInput())).resolves.toBeUndefined();
        expect(execBinaryMock).toHaveBeenCalledTimes(1);
    });

    it('skips create when a GitHub PR already exists', async () => {
        execBinaryMock
            .mockResolvedValueOnce(execOk('abc123\trefs/heads/lump/backlog/foo\n'))
            .mockResolvedValueOnce(execOk('[{"number":12}]'));

        const hook = openPrPostTeardown({ provider: 'github' });
        await hook(hookInput());

        expect(execBinaryMock).toHaveBeenCalledTimes(2);
        expect(execBinaryMock).toHaveBeenNthCalledWith(2, {
            binaryPath: 'gh',
            args: ['pr', 'list', '--head', 'lump/backlog/foo', '--base', 'dev', '--json', 'number'],
            cwd: '/tmp/ws',
        });
    });

    it('creates a GitHub PR against resolved baseBranch', async () => {
        execBinaryMock
            .mockResolvedValueOnce(execOk('abc123\trefs/heads/lump/backlog/foo\n'))
            .mockResolvedValueOnce(execOk('[]'))
            .mockResolvedValueOnce(execOk('https://github.com/org/repo/pull/1\n'));

        const hook = openPrPostTeardown({ provider: 'github' });
        await hook(hookInput({
            baseBranch: 'feature/foo',
            contextList: [
                { name: 'foo_req', variables: {} },
                { name: 'foo', variables: {} },
            ],
        }));

        expect(execBinaryMock).toHaveBeenNthCalledWith(3, {
            binaryPath: 'gh',
            args: [
                'pr',
                'create',
                '--base',
                'feature/foo',
                '--head',
                'lump/backlog/foo',
                '--title',
                'LUMP: backlog - foo_req, foo',
                '--body',
                'LUMP contexts: foo_req, foo',
            ],
            cwd: '/tmp/ws',
        });
    });

    it('uses custom title and body resolvers', async () => {
        execBinaryMock
            .mockResolvedValueOnce(execOk('abc123\trefs/heads/lump/backlog/foo\n'))
            .mockResolvedValueOnce(execOk('[]'))
            .mockResolvedValueOnce(execOk(''));

        const hook = openPrPostTeardown({
            provider: 'github',
            title: ({ branchName }) => `PR ${branchName}`,
            body: ({ baseBranch }) => `into ${baseBranch}`,
        });
        await hook(hookInput());

        expect(execBinaryMock).toHaveBeenNthCalledWith(3, {
            binaryPath: 'gh',
            args: [
                'pr',
                'create',
                '--base',
                'dev',
                '--head',
                'lump/backlog/foo',
                '--title',
                'PR lump/backlog/foo',
                '--body',
                'into dev',
            ],
            cwd: '/tmp/ws',
        });
    });

    it('uses an explicit lumpName over the branch prefix', async () => {
        execBinaryMock
            .mockResolvedValueOnce(execOk('abc123\trefs/heads/lump/backlog/foo\n'))
            .mockResolvedValueOnce(execOk('[]'))
            .mockResolvedValueOnce(execOk(''));

        const hook = openPrPostTeardown({ provider: 'github', lumpName: 'customLump' });
        await hook(hookInput());

        expect(execBinaryMock).toHaveBeenNthCalledWith(3, {
            binaryPath: 'gh',
            args: expect.arrayContaining(['--title', 'LUMP: customLump - foo']),
            cwd: '/tmp/ws',
        });
    });

    it('does not throw when gh pr create fails', async () => {
        execBinaryMock
            .mockResolvedValueOnce(execOk('abc123\trefs/heads/lump/backlog/foo\n'))
            .mockResolvedValueOnce(execOk('[]'))
            .mockResolvedValueOnce(execFail('gh failed'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const hook = openPrPostTeardown({ provider: 'github' });
        await expect(hook(hookInput())).resolves.toBeUndefined();
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('gh pr create failed: gh failed'),
        );

        errorSpy.mockRestore();
    });
});
