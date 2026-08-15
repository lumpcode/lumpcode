import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as core from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import { listRemoteHeadBranches } from './main';

vi.mock('@lumpcode/core', async () => {
    const actual = await vi.importActual<typeof core>('@lumpcode/core');
    return {
        ...actual,
        execAsync: vi.fn(),
    };
});

const execAsyncMock = vi.mocked(core.execAsync);

describe('listRemoteHeadBranches', () => {
    beforeEach(() => {
        execAsyncMock.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('returns parsed short names from ls-remote stdout', async () => {
        execAsyncMock.mockResolvedValue(
            success({
                stdout:
                    'abc123\trefs/heads/lump/my-lump/ctx-a\n' +
                    'def456 refs/heads/lump/my-lump/ctx-b\n',
                stderr: '',
            }),
        );

        const listed = await listRemoteHeadBranches({
            cwd: '/tmp/repo',
            branchGlob: 'lump/my-lump/*',
        });

        expect(listed).toEqual(success(['lump/my-lump/ctx-a', 'lump/my-lump/ctx-b']));
        expect(execAsyncMock).toHaveBeenCalledWith(
            expect.stringContaining("git ls-remote --heads origin"),
            { cwd: '/tmp/repo' },
        );
    });

    it('forwards timeoutMillis to execAsync', async () => {
        execAsyncMock.mockResolvedValue(success({ stdout: '', stderr: '' }));

        await listRemoteHeadBranches({
            cwd: '/tmp/repo',
            branchGlob: 'feature/*',
            timeoutMillis: 300_000,
        });

        expect(execAsyncMock).toHaveBeenCalledWith(expect.stringContaining('git ls-remote --heads origin'), {
            cwd: '/tmp/repo',
            timeoutMillis: 300_000,
        });
    });

    it('returns a timeout Failure when execAsync reports reason timeout', async () => {
        execAsyncMock.mockResolvedValue(
            failure({
                message: 'Command git ls-remote timed out after 300000ms',
                reason: 'timeout',
                info: { command: 'git ls-remote', stdout: '', stderr: '' },
            }),
        );

        const listed = await listRemoteHeadBranches({
            cwd: '/tmp/repo',
            branchGlob: 'feature/*',
            timeoutMillis: 300_000,
        });

        expect(listed).toEqual(
            failure({
                message: 'Command git ls-remote timed out after 300000ms',
                reason: 'timeout',
            }),
        );
    });

    it('returns Failure with reason exit on non-timeout exec failure', async () => {
        execAsyncMock.mockResolvedValue(
            failure({
                message: 'git failed',
                reason: 'exit',
                info: { command: 'git ls-remote', stdout: '', stderr: 'git failed' },
            }),
        );

        const listed = await listRemoteHeadBranches({
            cwd: '/tmp/repo',
            branchGlob: 'feature/*',
            timeoutMillis: 300_000,
        });

        expect(listed).toEqual(failure({ message: 'git failed', reason: 'exit' }));
    });

    it('applies postFilterBranchShortName and skips non-matching refs', async () => {
        execAsyncMock.mockResolvedValue(
            success({
                stdout:
                    'abc123\trefs/heads/lump/my-lump/ctx-a\n' +
                    'def456\trefs/heads/lump/other-lump/ctx-b\n' +
                    'ghi789\trefs/heads/main\n',
                stderr: '',
            }),
        );

        const listed = await listRemoteHeadBranches({
            cwd: '/tmp/repo',
            branchGlob: 'lump/*',
            postFilterBranchShortName: (shortName) => shortName.startsWith('lump/my-lump/'),
        });

        expect(listed).toEqual(success(['lump/my-lump/ctx-a']));
    });

    it('dedupes repeated branch names while preserving order', async () => {
        execAsyncMock.mockResolvedValue(
            success({
                stdout:
                    'abc123\trefs/heads/lump/my-lump/ctx-a\n' +
                    'def456\trefs/heads/lump/my-lump/ctx-b\n' +
                    'ghi789\trefs/heads/lump/my-lump/ctx-a\n',
                stderr: '',
            }),
        );

        const listed = await listRemoteHeadBranches({
            cwd: '/tmp/repo',
            branchGlob: 'lump/my-lump/*',
        });

        expect(listed).toEqual(success(['lump/my-lump/ctx-a', 'lump/my-lump/ctx-b']));
    });

    it('returns Failure when execAsync reports failure', async () => {
        execAsyncMock.mockResolvedValue(
            failure({
                message: 'git failed',
                reason: 'exit',
                info: { command: 'git ls-remote', stdout: '', stderr: 'git failed' },
            }),
        );

        const listed = await listRemoteHeadBranches({
            cwd: '/tmp/repo',
            branchGlob: 'lump/my-lump/*',
        });

        expect(listed).toEqual(failure({ message: 'git failed', reason: 'exit' }));
    });

    it('ignores lines with fewer than two whitespace-separated fields', async () => {
        execAsyncMock.mockResolvedValue(
            success({
                stdout:
                    'abc123\trefs/heads/lump/my-lump/ctx-a\n' +
                    'malformed-line\n' +
                    '\n' +
                    'def456\trefs/heads/lump/my-lump/ctx-b\n',
                stderr: '',
            }),
        );

        const listed = await listRemoteHeadBranches({
            cwd: '/tmp/repo',
            branchGlob: 'lump/my-lump/*',
        });

        expect(listed).toEqual(success(['lump/my-lump/ctx-a', 'lump/my-lump/ctx-b']));
    });
});
