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

        const branches = await listRemoteHeadBranches({
            cwd: '/tmp/repo',
            branchGlob: 'lump/my-lump/*',
        });

        expect(branches).toEqual(['lump/my-lump/ctx-a', 'lump/my-lump/ctx-b']);
        expect(execAsyncMock).toHaveBeenCalledWith(
            expect.stringContaining("git ls-remote --heads origin"),
            { cwd: '/tmp/repo' },
        );
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

        const branches = await listRemoteHeadBranches({
            cwd: '/tmp/repo',
            branchGlob: 'lump/*',
            postFilterBranchShortName: (shortName) => shortName.startsWith('lump/my-lump/'),
        });

        expect(branches).toEqual(['lump/my-lump/ctx-a']);
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

        const branches = await listRemoteHeadBranches({
            cwd: '/tmp/repo',
            branchGlob: 'lump/my-lump/*',
        });

        expect(branches).toEqual(['lump/my-lump/ctx-a', 'lump/my-lump/ctx-b']);
    });

    it('returns [] when execAsync reports failure', async () => {
        execAsyncMock.mockResolvedValue(
            failure({
                message: 'git failed',
                info: { command: 'git ls-remote', stdout: '', stderr: 'git failed' },
            }),
        );

        const branches = await listRemoteHeadBranches({
            cwd: '/tmp/repo',
            branchGlob: 'lump/my-lump/*',
        });

        expect(branches).toEqual([]);
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

        const branches = await listRemoteHeadBranches({
            cwd: '/tmp/repo',
            branchGlob: 'lump/my-lump/*',
        });

        expect(branches).toEqual(['lump/my-lump/ctx-a', 'lump/my-lump/ctx-b']);
    });
});
