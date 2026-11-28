import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { PostSetupWorkspaceFnInput } from '@lumpcode/cli-utils';
import * as core from '@lumpcode/core';
import { failure, success, type ContextResult, type ContextResultOutcome } from '@lumpcode/core';

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
        contextResults: [],
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

    it('does not open a PR for shared in-place branch make-my-new-lump', async () => {
        const hook = openPrPostTeardown({ provider: 'github' });
        await expect(
            hook(hookInput({ branchName: 'make-my-new-lump' })),
        ).resolves.toBeUndefined();
        expect(execBinaryMock).not.toHaveBeenCalled();
    });

    it('does not open a PR for shared in-place branch dev', async () => {
        const hook = openPrPostTeardown({ provider: 'github' });
        await expect(
            hook(hookInput({ branchName: 'dev', baseBranch: 'main' })),
        ).resolves.toBeUndefined();
        expect(execBinaryMock).not.toHaveBeenCalled();
    });

    it('opens a PR for a dedicated lump/myLump/button branch', async () => {
        execBinaryMock
            .mockResolvedValueOnce(execOk('abc123\trefs/heads/lump/myLump/button\n'))
            .mockResolvedValueOnce(execOk('[]'))
            .mockResolvedValueOnce(execOk('https://github.com/org/repo/pull/1\n'));

        const hook = openPrPostTeardown({ provider: 'github' });
        await hook(hookInput({
            branchName: 'lump/myLump/button',
            contextList: [{ name: 'button', variables: {} }],
        }));

        expect(execBinaryMock).toHaveBeenNthCalledWith(3, {
            binaryPath: 'gh',
            args: [
                'pr',
                'create',
                '--base',
                'dev',
                '--head',
                'lump/myLump/button',
                '--title',
                'LUMP: myLump - button',
                '--body',
                'LUMP contexts: button',
            ],
            cwd: '/tmp/ws',
        });
    });
});

// Skipped until the impl stage fills in the body and draft. Unskip; do not rewrite.
describe('openPrPostTeardown context results', () => {
    beforeEach(() => {
        execBinaryMock.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('keeps today\'s body when no pushed context has a message', async () => {
        primeCreate();
        const hook = openPrPostTeardown({ provider: 'github' });
        await hook(hookInput({
            contextList: [
                { name: 'beta', variables: {} },
                { name: 'alpha', variables: {} },
            ],
            contextResults: [
                contextResult({ name: 'alpha', outcome: 'pushed', succeeded: true }),
                contextResult({ name: 'beta', outcome: 'failed', succeeded: false, message: 'not pushed' }),
            ],
        }));

        expect(execBinaryMock).toHaveBeenNthCalledWith(3, {
            binaryPath: 'gh',
            args: prCreateArgs({
                title: 'LUMP: backlog - beta, alpha',
                body: 'LUMP contexts: beta, alpha',
                draft: false,
            }),
            cwd: '/tmp/ws',
        });
    });

    it('builds the body from pushed contexts that have a message, in result order', async () => {
        primeCreate();
        const hook = openPrPostTeardown({ provider: 'github' });
        await hook(hookInput({
            contextList: [
                { name: 'beta', variables: {} },
                { name: 'alpha', variables: {} },
            ],
            contextResults: [
                contextResult({
                    name: 'alpha',
                    outcome: 'pushed',
                    succeeded: true,
                    message: 'Alpha done.\nStill reviewing.',
                }),
                contextResult({
                    name: 'skipped',
                    outcome: 'notPushed',
                    succeeded: false,
                    message: 'left out',
                }),
                contextResult({ name: 'beta', outcome: 'pushed', succeeded: true, message: '' }),
                contextResult({
                    name: 'gamma',
                    outcome: 'pushed',
                    succeeded: false,
                    message: 'Gamma still red.',
                }),
            ],
        }));

        expect(execBinaryMock).toHaveBeenNthCalledWith(3, {
            binaryPath: 'gh',
            args: prCreateArgs({
                title: 'LUMP: backlog - beta, alpha',
                body: [
                    '### alpha',
                    'Alpha done.',
                    'Still reviewing.',
                    '',
                    '### gamma',
                    'Gamma still red.',
                ].join('\n'),
                draft: true,
            }),
            cwd: '/tmp/ws',
        });
    });

    it('opens a draft when a pushed context did not succeed, even with no message', async () => {
        primeCreate();
        const hook = openPrPostTeardown({ provider: 'github' });
        await hook(hookInput({
            contextList: [{ name: 'alpha', variables: {} }],
            contextResults: [
                contextResult({ name: 'alpha', outcome: 'pushed', succeeded: false }),
            ],
        }));

        expect(execBinaryMock).toHaveBeenNthCalledWith(3, {
            binaryPath: 'gh',
            args: prCreateArgs({
                title: 'LUMP: backlog - alpha',
                body: 'LUMP contexts: alpha',
                draft: true,
            }),
            cwd: '/tmp/ws',
        });
    });

    it('does not draft when draftOnFailure is false', async () => {
        primeCreate();
        const hook = openPrPostTeardown({ provider: 'github', draftOnFailure: false });
        await hook(hookInput({
            contextList: [{ name: 'alpha', variables: {} }],
            contextResults: [
                contextResult({
                    name: 'alpha',
                    outcome: 'pushed',
                    succeeded: false,
                    message: 'Still red.',
                }),
            ],
        }));

        expect(execBinaryMock).toHaveBeenNthCalledWith(3, {
            binaryPath: 'gh',
            args: prCreateArgs({
                title: 'LUMP: backlog - alpha',
                body: '### alpha\nStill red.',
                draft: false,
            }),
            cwd: '/tmp/ws',
        });
    });

    it('does not draft for a context that was not pushed', async () => {
        primeCreate();
        const hook = openPrPostTeardown({ provider: 'github' });
        await hook(hookInput({
            contextList: [{ name: 'alpha', variables: {} }],
            contextResults: [
                contextResult({ name: 'alpha', outcome: 'failed', succeeded: false, message: 'crashed' }),
                contextResult({ name: 'beta', outcome: 'aborted', succeeded: false, message: 'stopped' }),
                contextResult({ name: 'gamma', outcome: 'pushed', succeeded: true, message: 'Gamma done.' }),
            ],
        }));

        expect(execBinaryMock).toHaveBeenNthCalledWith(3, {
            binaryPath: 'gh',
            args: prCreateArgs({
                title: 'LUMP: backlog - alpha',
                body: '### gamma\nGamma done.',
                draft: false,
            }),
            cwd: '/tmp/ws',
        });
    });

    it('passes contextResults to title and body overrides', async () => {
        primeCreate();
        const hook = openPrPostTeardown({
            provider: 'github',
            title: ({ contextResults }) => contextResults.map((entry) => entry.context.name).join('+'),
            body: ({ contextResults }) => String(contextResults.length),
        });
        await hook(hookInput({
            contextList: [{ name: 'alpha', variables: {} }],
            contextResults: [
                contextResult({ name: 'alpha', outcome: 'pushed', succeeded: false, message: 'red' }),
                contextResult({ name: 'beta', outcome: 'pushed', succeeded: true, message: 'green' }),
            ],
        }));

        expect(execBinaryMock).toHaveBeenNthCalledWith(3, {
            binaryPath: 'gh',
            args: prCreateArgs({
                title: 'alpha+beta',
                body: '2',
                draft: true,
            }),
            cwd: '/tmp/ws',
        });
    });
});

function contextResult({
    name,
    outcome,
    succeeded,
    message,
}: {
    name: string;
    outcome: ContextResultOutcome;
    succeeded: boolean;
    message?: string;
}): ContextResult {
    return {
        context: { name, variables: {} },
        outcome,
        result: {
            succeeded,
            push: outcome === 'pushed',
            ...(message === undefined ? {} : { message }),
        },
    };
}

function prCreateArgs({ title, body, draft }: { title: string; body: string; draft: boolean }): string[] {
    return [
        'pr',
        'create',
        ...(draft ? ['--draft'] : []),
        '--base',
        'dev',
        '--head',
        'lump/backlog/foo',
        '--title',
        title,
        '--body',
        body,
    ];
}

function primeCreate(): void {
    execBinaryMock
        .mockResolvedValueOnce(execOk('abc123\trefs/heads/lump/backlog/foo\n'))
        .mockResolvedValueOnce(execOk('[]'))
        .mockResolvedValueOnce(execOk('https://github.com/org/repo/pull/1\n'));
}
