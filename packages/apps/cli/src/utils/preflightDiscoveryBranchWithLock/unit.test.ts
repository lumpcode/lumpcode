import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { success } from '@lumpcode/core';

import {
    createIntegrationBranch,
    gitCurrentBranch,
    initBareRemoteAndCheckout,
    writeLocalJson,
} from '../../testing';
import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { noopLogger } from '../noopLogger';
import { writeJsonFile } from '../writeJsonFile';
import { preflightDiscoveryBranchWithLock } from './main';

const FEATURE_BRANCH = 'feature/a';
const FEATURE_ONLY_FILE = 'only-on-feature.txt';

describe('preflightDiscoveryBranchWithLock', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        ({ projectRoot, remoteDir, globalConfigFolderPath, localConfigFolderPath } = await createTempTestDirs({
            prefix: 'lump-preflight-discovery-lock-',
        }));
        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'project.json'),
            data: { projectName: 'preflight-discovery-lock' },
        });
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
            workspaceStrategy: 'worktree',
        });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: FEATURE_BRANCH,
            extraFiles: { [FEATURE_ONLY_FILE]: 'feature-only\n' },
        });
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, remoteDir, globalConfigFolderPath });
    });

    it('keeps the source checkout on the discovery branch until the caller finishes reading it', async () => {
        const featureRead = await preflightDiscoveryBranchWithLock({
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
                workspaceStrategy: 'worktree',
            },
            discoveryBranch: FEATURE_BRANCH,
            lumpName: 'featureBacklog',
            lockMode: 'wait',
            logger: noopLogger,
            holdForRun: true,
            workspaceStrategy: 'worktree',
            fn: async () => success(undefined),
        });
        expect(featureRead.success).toBe(true);
        if (!featureRead.success) throw new Error('unreachable');

        const devSwitch = preflightDiscoveryBranchWithLock({
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
                workspaceStrategy: 'worktree',
            },
            discoveryBranch: 'main',
            lumpName: 'fixAzureBugs',
            lockMode: 'wait',
            logger: noopLogger,
            holdForRun: true,
            workspaceStrategy: 'worktree',
            fn: async () => success(undefined),
        });

        const switchedAway = await branchLeftFeatureWithin(projectRoot, 2000);

        expect(switchedAway).toBe(false);
        expect(gitCurrentBranch(projectRoot)).toBe(FEATURE_BRANCH);
        await expect(fs.readFile(path.join(projectRoot, FEATURE_ONLY_FILE), 'utf-8')).resolves.toBe('feature-only\n');

        if (featureRead.data.releaseLock) {
            await featureRead.data.releaseLock();
        }
        const devResult = await devSwitch;
        expect(devResult.success).toBe(true);
        if (devResult.success && devResult.data.releaseLock) {
            await devResult.data.releaseLock();
        }
    });
});

async function branchLeftFeatureWithin(cwd: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (gitCurrentBranch(cwd) !== FEATURE_BRANCH) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
}
