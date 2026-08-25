import { describe, expect, it, vi, beforeEach } from 'vitest';
import { failure, success, type Context } from '@lumpcode/core';

import type { LumpJsConfig } from '../../types';
import type { LocalConfig } from '../../types/LocalConfig';
import {
    scoreDedicatedLumpLineSnapshots,
    snapshotDedicatedLumpLine,
    type DedicatedLumpLineSnapshot,
    type ScoredLumpLine,
} from './main';

vi.mock('../jsConfigToRunLumpInput', () => ({
    jsConfigToRunLumpInput: vi.fn(),
}));

vi.mock('@lumpcode/core', async () => {
    const actual = await vi.importActual<typeof import('@lumpcode/core')>('@lumpcode/core');
    return {
        ...actual,
        getToDoContextList: vi.fn(),
        getCodeBasePaths: vi.fn(),
        execAsync: vi.fn(),
    };
});

vi.mock('../getProjectName', () => ({
    getProjectName: vi.fn(async () => success('test-project')),
}));

vi.mock('../getExecutionWorkspacePath', () => ({
    getExecutionWorkspacePath: vi.fn(() => '/tmp/exec'),
}));

vi.mock('../resolvePrimaryBranches', () => ({
    resolvePrimaryBranch: vi.fn(() => 'main'),
}));

vi.mock('../makeLockedRefreshRemoteTrackingRefsFn', () => ({
    makeLockedRefreshRemoteTrackingRefsFn: vi.fn(),
}));

import * as core from '@lumpcode/core';
import { jsConfigToRunLumpInput } from '../jsConfigToRunLumpInput';
import { makeLockedRefreshRemoteTrackingRefsFn } from '../makeLockedRefreshRemoteTrackingRefsFn';

const jsConfigToRunLumpInputMock = vi.mocked(jsConfigToRunLumpInput);
const getToDoContextListMock = vi.mocked(core.getToDoContextList);
const getCodeBasePathsMock = vi.mocked(core.getCodeBasePaths);
const execAsyncMock = vi.mocked(core.execAsync);
const makeLockedRefreshMock = vi.mocked(makeLockedRefreshRemoteTrackingRefsFn);

function createLogger() {
    return {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        verbose: vi.fn(),
        child: () => createLogger(),
    };
}

const baseLocalConfig: LocalConfig = {
    mode: 'dedicated',
    primaryBranch: 'main',
    workspaceStrategy: 'checkout',
};

const baseJsConfig = {
    contextListJson: { NAME: 'README' },
    prompt: { promptTemplate: 'x', command: 'copilot' },
} as LumpJsConfig;

const getContextListFn = vi.fn(async (): Promise<Context[]> => []);

function snapshotInput(overrides: Partial<Parameters<typeof snapshotDedicatedLumpLine>[0]> = {}) {
    return {
        lumpName: 'backlog',
        jsConfig: baseJsConfig,
        effectiveDiscoveryBranch: 'feature/x',
        localConfigFolderPath: '/tmp/proj/.lumpcode',
        globalConfigFolderPath: '/tmp/global',
        sourceProjectRoot: '/tmp/proj',
        localConfig: baseLocalConfig,
        logger: createLogger(),
        projectName: 'test-project',
        ...overrides,
    };
}

function readySnapshot(
    overrides: Partial<Extract<DedicatedLumpLineSnapshot, { kind: 'ready' }>> = {},
): Extract<DedicatedLumpLineSnapshot, { kind: 'ready' }> {
    return {
        kind: 'ready',
        lumpName: 'backlog',
        effectiveDiscoveryBranch: 'feature/x',
        projectRoot: '/tmp/proj',
        baseBranch: 'feature/x',
        lumpVariables: {},
        gitCommitMessageFn: () => 'm',
        contextList: [{ name: 'a', variables: {} }],
        ...overrides,
    };
}

function scoreSnapshots(snapshots: DedicatedLumpLineSnapshot[]) {
    return scoreDedicatedLumpLineSnapshots({
        snapshots,
        logger: createLogger(),
        globalConfigFolderPath: '/tmp/global',
        projectName: 'test-project',
    });
}

function lineScores(items: ScoredLumpLine[]) {
    return items.map((item) => item.lineScore);
}

describe('scoreDedicatedLumpLine', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getContextListFn.mockReset();
        getContextListFn.mockResolvedValue([]);
        getCodeBasePathsMock.mockResolvedValue(success([]));
        execAsyncMock.mockResolvedValue(success({ stdout: 'feature/x\n', stderr: '' }));
        makeLockedRefreshMock.mockReturnValue(async () => success(undefined));
        jsConfigToRunLumpInputMock.mockResolvedValue(
            success({
                projectRoot: '/tmp/proj',
                baseBranch: 'feature/x',
                getContextListFn,
                gitCommitMessageFn: () => 'm',
                lumpVariables: {},
                refreshRemoteTrackingRefsFn: async () => success(undefined),
                steps: [],
            } as never),
        );
    });

    it('snapshot reads the context list without calling getToDoContextList', async () => {
        const paths = [{ path: 'README.md', isDir: false }];
        getCodeBasePathsMock.mockResolvedValue(success(paths));
        getContextListFn.mockResolvedValue([{ name: 'item', variables: {} }]);

        const snapshot = await snapshotDedicatedLumpLine(snapshotInput());

        expect(getToDoContextListMock).not.toHaveBeenCalled();
        expect(execAsyncMock).toHaveBeenCalledWith('git rev-parse --abbrev-ref HEAD', {
            cwd: '/tmp/proj',
        });
        expect(getContextListFn).toHaveBeenCalledWith({
            codeBasePaths: paths,
            lumpVariables: {},
        });
        expect(snapshot).toMatchObject({
            kind: 'ready',
            lumpName: 'backlog',
            effectiveDiscoveryBranch: 'feature/x',
            contextList: [{ name: 'item', variables: {} }],
        });
    });

    it('snapshot is failed when jsConfigToRunLumpInput fails', async () => {
        jsConfigToRunLumpInputMock.mockResolvedValue(failure('bad config'));

        const snapshot = await snapshotDedicatedLumpLine(snapshotInput());
        expect(snapshot).toEqual({
            kind: 'failed',
            lumpName: 'backlog',
            effectiveDiscoveryBranch: 'feature/x',
            reason: 'bad config',
        });

        const items = await scoreSnapshots([snapshot]);
        expect(getToDoContextListMock).not.toHaveBeenCalled();
        expect(makeLockedRefreshMock).not.toHaveBeenCalled();
        expect(lineScores(items)).toEqual([{ kind: 'failed', reason: 'bad config' }]);
        expect(execAsyncMock).not.toHaveBeenCalled();
        expect(getCodeBasePathsMock).not.toHaveBeenCalled();
    });

    it('snapshot is failed when projectRoot HEAD is not effectiveDiscoveryBranch', async () => {
        execAsyncMock.mockResolvedValue(success({ stdout: 'main\n', stderr: '' }));

        const snapshot = await snapshotDedicatedLumpLine(snapshotInput());
        expect(snapshot).toEqual({
            kind: 'failed',
            lumpName: 'backlog',
            effectiveDiscoveryBranch: 'feature/x',
            reason: 'projectRoot HEAD is "main", expected discovery branch "feature/x"',
        });
        expect(getCodeBasePathsMock).not.toHaveBeenCalled();
        expect(getContextListFn).not.toHaveBeenCalled();
        expect(getToDoContextListMock).not.toHaveBeenCalled();
    });

    it('snapshot is failed when rev-parse fails', async () => {
        execAsyncMock.mockResolvedValue(
            failure({
                message: 'not a git repo',
                reason: 'exit' as const,
                info: { command: 'git rev-parse --abbrev-ref HEAD', stdout: '', stderr: '' },
            }),
        );

        const snapshot = await snapshotDedicatedLumpLine(snapshotInput());
        expect(snapshot).toEqual({
            kind: 'failed',
            lumpName: 'backlog',
            effectiveDiscoveryBranch: 'feature/x',
            reason: 'not a git repo',
        });
        expect(getCodeBasePathsMock).not.toHaveBeenCalled();
        expect(getContextListFn).not.toHaveBeenCalled();
    });

    it('returns scored with min priority using || 0 missing-priority rule', async () => {
        getToDoContextListMock.mockResolvedValue(
            success([
                { name: 'a', variables: {}, options: { priority: 1 } },
                { name: 'b', variables: {} },
                { name: 'c', variables: {}, options: { priority: 5 } },
            ]),
        );

        const items = await scoreSnapshots([readySnapshot()]);
        expect(lineScores(items)).toEqual([{ kind: 'scored', value: 0 }]);
    });

    it('returns scored with the minimum among explicit priorities', async () => {
        getToDoContextListMock.mockResolvedValue(
            success([
                { name: 'a', variables: {}, options: { priority: 10 } },
                { name: 'b', variables: {}, options: { priority: 3 } },
            ]),
        );

        const items = await scoreSnapshots([readySnapshot()]);
        expect(lineScores(items)).toEqual([{ kind: 'scored', value: 3 }]);
    });

    it('returns empty when todo list is empty', async () => {
        getToDoContextListMock.mockResolvedValue(success([]));

        const items = await scoreSnapshots([readySnapshot()]);
        expect(lineScores(items)).toEqual([{ kind: 'empty' }]);
    });

    it('returns failed when getToDoContextList fails', async () => {
        getToDoContextListMock.mockResolvedValue(failure({ message: 'status boom' }));

        const items = await scoreSnapshots([readySnapshot()]);
        expect(lineScores(items)).toEqual([{ kind: 'failed', reason: 'status boom' }]);
    });

    it('returns failed when getToDoContextList throws', async () => {
        getToDoContextListMock.mockRejectedValue(new Error('unexpected'));

        const items = await scoreSnapshots([readySnapshot()]);
        expect(lineScores(items)).toEqual([{ kind: 'failed', reason: 'unexpected' }]);
    });

    it('classifies the frozen context list via an injected getContextListFn', async () => {
        const frozen = [{ name: 'frozen', variables: {}, options: { priority: 4 } }];
        getToDoContextListMock.mockResolvedValue(success(frozen));

        const items = await scoreSnapshots([readySnapshot({ contextList: frozen })]);

        expect(lineScores(items)).toEqual([{ kind: 'scored', value: 4 }]);
        const passedInput = getToDoContextListMock.mock.calls[0]![0];
        expect('contextList' in passedInput).toBe(false);
        expect(await passedInput.getContextListFn({ codeBasePaths: [], lumpVariables: {} })).toEqual(
            frozen,
        );
    });

    it('refreshes once then reuses that refresh fn for every ready line', async () => {
        const lockedRefresh = vi.fn(async () => success(undefined));
        makeLockedRefreshMock.mockReturnValue(lockedRefresh);
        getToDoContextListMock
            .mockResolvedValueOnce(success([{ name: 'a', variables: {}, options: { priority: 10 } }]))
            .mockResolvedValueOnce(success([{ name: 'b', variables: {}, options: { priority: 3 } }]));

        const items = await scoreSnapshots([
            readySnapshot({ lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' }),
            readySnapshot({ lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/x' }),
        ]);

        expect(makeLockedRefreshMock).toHaveBeenCalledTimes(1);
        expect(lockedRefresh).toHaveBeenCalledTimes(1);
        expect(getToDoContextListMock).toHaveBeenCalledTimes(2);
        for (const [input] of getToDoContextListMock.mock.calls) {
            const refreshResult = await input.refreshRemoteTrackingRefsFn!({ projectRoot: '/tmp/proj' });
            expect(refreshResult).toEqual(success(undefined));
        }
        expect(lockedRefresh).toHaveBeenCalledTimes(1);
        expect(items).toEqual([
            {
                lumpName: 'backlog',
                effectiveDiscoveryBranch: 'dev',
                lineScore: { kind: 'scored', value: 10 },
            },
            {
                lumpName: 'backlog',
                effectiveDiscoveryBranch: 'feature/x',
                lineScore: { kind: 'scored', value: 3 },
            },
        ]);
    });

    it('skips fetch when every snapshot failed', async () => {
        const items = await scoreSnapshots([
            {
                kind: 'failed',
                lumpName: 'backlog',
                effectiveDiscoveryBranch: 'dev',
                reason: 'bad config',
            },
        ]);

        expect(makeLockedRefreshMock).not.toHaveBeenCalled();
        expect(getToDoContextListMock).not.toHaveBeenCalled();
        expect(items).toEqual([
            {
                lumpName: 'backlog',
                effectiveDiscoveryBranch: 'dev',
                lineScore: { kind: 'failed', reason: 'bad config' },
            },
        ]);
    });

    it('injects a failed refresh so status soft-falls', async () => {
        const refreshFailure = failure('net down');
        makeLockedRefreshMock.mockReturnValue(async () => refreshFailure);
        getToDoContextListMock.mockResolvedValue(
            success([{ name: 'a', variables: {}, options: { priority: 2 } }]),
        );

        const items = await scoreSnapshots([readySnapshot()]);

        expect(lineScores(items)).toEqual([{ kind: 'scored', value: 2 }]);
        const refreshFn = getToDoContextListMock.mock.calls[0]![0].refreshRemoteTrackingRefsFn!;
        expect(await refreshFn({ projectRoot: '/tmp/proj' })).toEqual(refreshFailure);
    });
});
