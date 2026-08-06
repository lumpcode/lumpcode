import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { failure, success } from '../../utils';
import { execAsync } from '../execAsync';
import { getToDoContextList } from './main';
import type { GitCommitMessageFn } from '../../types/GitCommitMessageFn';
import type { RefreshRemoteTrackingRefsFn } from '../refreshRemoteTrackingRefs';

const baseBranch = 'main';
const gitCommitMessageFn: GitCommitMessageFn = ({ context }) => `LUMP:${context.name}`;

async function git(projectRoot: string, cmd: string) {
    return execAsync(`git ${cmd}`, { cwd: projectRoot });
}

describe('getToDoContextList', () => {
    let projectRoot: string;
    let remoteDir: string;

    beforeEach(async () => {
        projectRoot = await mkdtemp(join(tmpdir(), 'todo-ctx-'));
        remoteDir = await mkdtemp(join(tmpdir(), 'todo-ctx-remote-'));
        await git(projectRoot, 'init -b main');
        await git(projectRoot, 'config user.email "test@test.com"');
        await git(projectRoot, 'config user.name "Test"');
        await git(projectRoot, 'commit --allow-empty -m "init"');
        await git(remoteDir, 'init --bare');
        await git(projectRoot, `remote add origin ${remoteDir}`);
        await git(projectRoot, 'push -u origin main');
    });

    afterEach(async () => {
        await rm(projectRoot, { recursive: true });
        await rm(remoteDir, { recursive: true });
    });

    it('resolves status by context name when dependsOnContexts inserts extra names', async () => {
        // Extra allCtxNamesList slot: finished cross-lump dep not present in contextList.
        // Index-based lookup would assign that "finished" status to later-todo and drop it.
        await git(projectRoot, 'commit --allow-empty -m "LUMP:otherLump/dep"');
        await git(projectRoot, 'push origin main');

        const result = await getToDoContextList({
            getContextListFn: async () => [
                {
                    name: 'ready-after-dep',
                    variables: {},
                    options: { dependsOnContexts: ['otherLump/dep'] },
                },
                { name: 'later-todo', variables: {} },
            ],
            lumpVariables: {},
            gitCommitMessageFn,
            projectRoot,
            baseBranch,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;

        expect(result.data.map((c) => c.name)).toEqual(['ready-after-dep', 'later-todo']);
    });

    it('excludes a finished context even when a prior dependsOnContexts name shifts status indices', async () => {
        await git(projectRoot, 'commit --allow-empty -m "LUMP:later-finished"');
        await git(projectRoot, 'push origin main');

        const result = await getToDoContextList({
            getContextListFn: async () => [
                {
                    name: 'waiting-on-dep',
                    variables: {},
                    options: { dependsOnContexts: ['otherLump/unfinished'] },
                },
                { name: 'later-finished', variables: {} },
            ],
            lumpVariables: {},
            gitCommitMessageFn,
            projectRoot,
            baseBranch,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;

        // Index bug: later-finished would read otherLump/unfinished's "toDo" and stay eligible.
        expect(result.data.map((c) => c.name)).toEqual([]);
    });

    it('soft-falls to all toDo when refreshRemoteTrackingRefsFn fails', async () => {
        await git(projectRoot, 'commit --allow-empty -m "LUMP:finished-ctx"');
        await git(projectRoot, 'push origin main');

        const refreshRemoteTrackingRefsFn: RefreshRemoteTrackingRefsFn = vi.fn(async () =>
            failure('simulated refresh failure'),
        );
        const warn = vi.fn();

        const result = await getToDoContextList({
            getContextListFn: async () => [
                { name: 'finished-ctx', variables: {} },
                { name: 'other-todo', variables: {} },
            ],
            lumpVariables: {},
            gitCommitMessageFn,
            projectRoot,
            baseBranch,
            refreshRemoteTrackingRefsFn,
            logger: {
                info: vi.fn(),
                warn,
                error: vi.fn(),
                verbose: vi.fn(),
                child: vi.fn(),
            },
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.map((c) => c.name)).toEqual(['finished-ctx', 'other-todo']);
        expect(refreshRemoteTrackingRefsFn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalled();
    });

    it('uses injected refresh once then skipFetch status reads', async () => {
        await git(projectRoot, 'commit --allow-empty -m "LUMP:finished-ctx"');
        await git(projectRoot, 'push origin main');

        const refreshRemoteTrackingRefsFn: RefreshRemoteTrackingRefsFn = vi.fn(async () =>
            success(undefined),
        );

        const result = await getToDoContextList({
            getContextListFn: async () => [
                { name: 'finished-ctx', variables: {} },
                { name: 'other-todo', variables: {} },
            ],
            lumpVariables: {},
            gitCommitMessageFn,
            projectRoot,
            baseBranch,
            refreshRemoteTrackingRefsFn,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.map((c) => c.name)).toEqual(['other-todo']);
        expect(refreshRemoteTrackingRefsFn).toHaveBeenCalledTimes(1);
    });
});

