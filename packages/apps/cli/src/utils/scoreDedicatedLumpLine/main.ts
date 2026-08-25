import {
    execAsync,
    getCodeBasePaths,
    getToDoContextList,
    success,
    type Context,
    type GitCommitMessageFn,
    type Logger,
    type LumpVariables,
    type RefreshRemoteTrackingRefsFn,
} from '@lumpcode/core';

import { DISCOVERY_SCAN_LOCK_HOLDER } from '../../consts';
import type { LumpJsConfig } from '../../types';
import type { LocalConfig } from '../../types/LocalConfig';
import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import type { WorkspaceLockMode } from '../workspaceFileLock';
import { getExecutionWorkspacePath } from '../getExecutionWorkspacePath';
import { getProjectName } from '../getProjectName';
import type { GitCommonDirLockContext } from '../gitCommonDirLock';
import { jsConfigToRunLumpInput } from '../jsConfigToRunLumpInput';
import { makeGitCommitMessageFnFromLumpName } from '../makeGitCommitMessageFnFromLumpName';
import { makeLockedRefreshRemoteTrackingRefsFn } from '../makeLockedRefreshRemoteTrackingRefsFn';
import { resolvePrimaryBranch } from '../resolvePrimaryBranches';
import type { LumpLine } from '../runLumpQueueWithConcurrency';

export type LineScore =
    | { kind: 'scored'; value: number }
    | { kind: 'empty' }
    | { kind: 'failed'; reason: string };

export type ScoredLumpLine = LumpLine & { lineScore: LineScore };

export type SnapshotDedicatedLumpLineInput = LumpLine & {
    jsConfig: LumpJsConfig;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    sourceProjectRoot: string;
    localConfig: LocalConfig | ResolvedProjectLocalConfig;
    logger: Logger;
    projectName?: string;
};

type ReadyDedicatedLumpLineSnapshot = LumpLine & {
    kind: 'ready';
    projectRoot: string;
    baseBranch: string;
    lumpVariables: LumpVariables;
    gitCommitMessageFn: GitCommitMessageFn;
    contextList: Context[];
};

type FailedDedicatedLumpLineSnapshot = LumpLine & {
    kind: 'failed';
    reason: string;
};

export type DedicatedLumpLineSnapshot =
    | ReadyDedicatedLumpLineSnapshot
    | FailedDedicatedLumpLineSnapshot;

function failedSnapshot(line: LumpLine, reason: string): FailedDedicatedLumpLineSnapshot {
    return {
        kind: 'failed',
        lumpName: line.lumpName,
        effectiveDiscoveryBranch: line.effectiveDiscoveryBranch,
        reason,
    };
}

function errorReason(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function lineScoreFromTodos(todos: Context[]): LineScore {
    if (todos.length === 0) {
        return { kind: 'empty' };
    }

    let minPriority = todos[0]!.options?.priority || 0;
    for (let i = 1; i < todos.length; i++) {
        const p = todos[i]!.options?.priority || 0;
        if (p < minPriority) {
            minPriority = p;
        }
    }
    return { kind: 'scored', value: minPriority };
}

function toScoredLumpLine(
    snapshot: DedicatedLumpLineSnapshot,
    lineScore: LineScore,
): ScoredLumpLine {
    return {
        lumpName: snapshot.lumpName,
        effectiveDiscoveryBranch: snapshot.effectiveDiscoveryBranch,
        lineScore,
    };
}

/**
 * In-lock snapshot: bind config and read the context list while checkout is still
 * `scanBranch`. `getCodeBasePaths` walks `projectRoot`; fail-closes unless HEAD is
 * `effectiveDiscoveryBranch`. Does not fetch remotes or classify status.
 */
export async function snapshotDedicatedLumpLine(
    input: SnapshotDedicatedLumpLineInput,
): Promise<DedicatedLumpLineSnapshot> {
    const {
        lumpName,
        jsConfig,
        effectiveDiscoveryBranch,
        localConfigFolderPath,
        globalConfigFolderPath,
        sourceProjectRoot,
        localConfig,
        logger,
        projectName: projectNameInput,
    } = input;

    try {
        let projectBaseBranch: string;
        try {
            projectBaseBranch = resolvePrimaryBranch(localConfig, logger);
        } catch (err) {
            return failedSnapshot(input, errorReason(err));
        }

        const projectNameResult =
            projectNameInput !== undefined
                ? { success: true as const, data: projectNameInput }
                : await getProjectName({ localConfigFolderPath, projectRoot: sourceProjectRoot });
        if (!projectNameResult.success) {
            return failedSnapshot(input, projectNameResult.data);
        }
        const projectName = projectNameResult.data;

        const executionWorkspacePath = getExecutionWorkspacePath({
            mode: localConfig.mode,
            sourceProjectRoot,
            globalConfigFolderPath,
            projectName,
        });

        const runLumpInputResult = await jsConfigToRunLumpInput({
            config: jsConfig,
            lumpName,
            localConfigFolderPath,
            globalConfigFolderPath,
            projectBaseBranch,
            executionWorkspacePath,
            workspaceStrategy: localConfig.workspaceStrategy ?? 'checkout',
            logger,
            localConfig,
            effectiveDiscoveryBranch,
            skipPostWorkspaceHooks: true,
        });
        if (!runLumpInputResult.success) {
            return failedSnapshot(input, runLumpInputResult.data);
        }

        const runInput = runLumpInputResult.data;
        const headResult = await execAsync('git rev-parse --abbrev-ref HEAD', {
            cwd: runInput.projectRoot,
        });
        if (!headResult.success) {
            return failedSnapshot(input, headResult.data.message);
        }
        const currentBranch = headResult.data.stdout.trim();
        if (currentBranch !== effectiveDiscoveryBranch) {
            return failedSnapshot(
                input,
                `projectRoot HEAD is "${currentBranch}", expected discovery branch "${effectiveDiscoveryBranch}"`,
            );
        }

        const codeBasePathsResult = await getCodeBasePaths({
            cwd: runInput.projectRoot,
            logger,
        });
        if (!codeBasePathsResult.success) {
            return failedSnapshot(input, codeBasePathsResult.data.message);
        }

        const lumpVariables = runInput.lumpVariables ?? {};
        const contextList = await runInput.getContextListFn({
            codeBasePaths: codeBasePathsResult.data,
            lumpVariables,
        });

        return {
            kind: 'ready',
            lumpName,
            effectiveDiscoveryBranch,
            projectRoot: runInput.projectRoot,
            baseBranch: runInput.baseBranch,
            lumpVariables,
            gitCommitMessageFn: makeGitCommitMessageFnFromLumpName(lumpName),
            contextList,
        };
    } catch (err) {
        return failedSnapshot(input, errorReason(err));
    }
}

/**
 * Score one snapshot: classify the frozen context list from existing refs
 * (`refreshRemoteTrackingRefsFn` was already run once for the scan branch).
 */
export async function scoreDedicatedLumpLine(input: {
    snapshot: DedicatedLumpLineSnapshot;
    logger: Logger;
    refreshRemoteTrackingRefsFn: RefreshRemoteTrackingRefsFn;
}): Promise<ScoredLumpLine> {
    const { snapshot, logger, refreshRemoteTrackingRefsFn } = input;

    if (snapshot.kind === 'failed') {
        return toScoredLumpLine(snapshot, { kind: 'failed', reason: snapshot.reason });
    }

    try {
        const todoResult = await getToDoContextList({
            getContextListFn: async () => snapshot.contextList,
            lumpVariables: snapshot.lumpVariables,
            gitCommitMessageFn: snapshot.gitCommitMessageFn,
            projectRoot: snapshot.projectRoot,
            baseBranch: snapshot.baseBranch,
            logger,
            refreshRemoteTrackingRefsFn,
        });
        if (!todoResult.success) {
            return toScoredLumpLine(snapshot, { kind: 'failed', reason: todoResult.data.message });
        }
        return toScoredLumpLine(snapshot, lineScoreFromTodos(todoResult.data));
    } catch (err) {
        return toScoredLumpLine(snapshot, { kind: 'failed', reason: errorReason(err) });
    }
}

/**
 * One locked remote refresh for a scan branch, then score every snapshot
 * from existing refs. Fetch failure injects the same Failure into each ready
 * line so `getToDoContextList` soft-falls to all-toDo.
 */
export async function scoreDedicatedLumpLineSnapshots(input: {
    snapshots: readonly DedicatedLumpLineSnapshot[];
    logger: Logger;
    globalConfigFolderPath: string;
    projectName?: string;
    lockMode?: WorkspaceLockMode;
}): Promise<ScoredLumpLine[]> {
    const {
        snapshots,
        logger,
        globalConfigFolderPath,
        projectName,
        lockMode = 'wait',
    } = input;

    if (snapshots.length === 0) {
        return [];
    }

    const ready = snapshots.find(
        (snapshot): snapshot is ReadyDedicatedLumpLineSnapshot => snapshot.kind === 'ready',
    );
    let refreshRemoteTrackingRefsFn: RefreshRemoteTrackingRefsFn = async () => success(undefined);

    if (ready !== undefined) {
        const gitLock: GitCommonDirLockContext = {
            globalConfigFolderPath,
            gitCwd: ready.projectRoot,
            lumpName: DISCOVERY_SCAN_LOCK_HOLDER,
            lockMode,
            ...(projectName !== undefined ? { projectName } : {}),
            logger,
        };
        const lockedRefresh = makeLockedRefreshRemoteTrackingRefsFn({ gitLock });
        const refreshResult = await lockedRefresh({ projectRoot: ready.projectRoot });
        if (!refreshResult.success) {
            refreshRemoteTrackingRefsFn = async () => refreshResult;
        }
    }

    const items: ScoredLumpLine[] = [];
    for (const snapshot of snapshots) {
        items.push(
            await scoreDedicatedLumpLine({ snapshot, logger, refreshRemoteTrackingRefsFn }),
        );
    }
    return items;
}
