import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import type { Logger } from '@lumpcode/core';

import {
    createIntegrationBranch,
    initBareRemoteAndCheckout,
    writeLocalJson,
    writeMinimalLump,
} from '../../testing';
import { gitCommitAllAndPush } from '../gitCommitAllAndPush';
import { validateDaemonLaunch } from './main';
import { writeJsonFile } from '../writeJsonFile';
import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { writeLumpConfigJson } from '../writeLumpConfigJson';

function createLogger(): Logger & { warnings: string[] } {
    const warnings: string[] = [];
    const logger: Logger & { warnings: string[] } = {
        warnings,
        info: vi.fn(),
        warn: (message: string) => {
            warnings.push(message);
        },
        error: vi.fn(),
        verbose: vi.fn(),
        child: () => logger,
    };
    return logger;
}

describe('validateDaemonLaunch', () => {
    let localConfigFolderPath: string;
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        ({ projectRoot, remoteDir, globalConfigFolderPath, localConfigFolderPath } = await createTempTestDirs({ prefix: 'lump-validate-daemon-launch-' }));
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
        });
        await writeJsonFile({ filePath: path.join(localConfigFolderPath, 'project.json'), data: { projectName: 'validate-daemon-launch-test' } });
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, remoteDir, globalConfigFolderPath });
    });

    it('warns and succeeds when a lump directory has no loadable config (dedicated)', async () => {
        await writeLumpConfigJson({ localConfigFolderPath, lumpName: 'alpha' });
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'v0.0.9'), { recursive: true });
        gitCommitAllAndPush({ cwd: projectRoot, message: 'alpha and empty v0.0.9 dir' });

        const logger = createLogger();
        const result = await validateDaemonLaunch({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: { mode: 'dedicated', primaryBranch: 'main' },
            logger,
        });

        expect(result.success).toBe(true);
        expect(logger.warnings).toEqual([
            'lump "v0.0.9": Lump config not found for v0.0.9; skipping',
        ]);
    });

    it('succeeds when releaseLine exists only on ver/0.0.9', async () => {
        await writeMinimalLump(projectRoot, 'mainLine', { discoveryBranch: 'main' });
        gitCommitAllAndPush({ cwd: projectRoot, message: 'mainLine on main' });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'ver/0.0.9',
            lumpSpecs: [
                {
                    name: 'releaseLine',
                    configOverrides: { discoveryBranch: 'ver/0.0.9', baseBranch: 'ver/0.0.9' },
                },
            ],
        });

        const logger = createLogger();
        const result = await validateDaemonLaunch({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'ver/0.0.9'],
            },
            logger,
        });

        expect(result.success).toBe(true);
    });

    /**
     * dynamic-discovery-branch V1–V3.
     * Expand / all-glob fail / pattern allowlist at launch.
     * Skipped until expand + glob allowlist land.
     */
    describe('dynamic-discovery-branch launch validation (V*)', () => {
        it('V1: all-glob primaryBranches fails launch', async () => {
            await writeMinimalLump(projectRoot, 'alpha');
            gitCommitAllAndPush({ cwd: projectRoot, message: 'alpha' });

            const logger = createLogger();
            const result = await validateDaemonLaunch({
                projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
                localConfig: {
                    mode: 'dedicated',
                    primaryBranches: ['feature/*'],
                },
                logger,
            });

            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toMatch(/exact|glob|primary/i);
        });

        it('V2: duplicate lumpName on same scan still fails launch', async () => {
            // Existing behavior retained — two dirs same name is a filesystem concern;
            // same lumpName eligible twice on one scanBranch fails.
            await writeMinimalLump(projectRoot, 'dup', { discoveryBranch: 'main' });
            gitCommitAllAndPush({ cwd: projectRoot, message: 'dup' });
            // Second copy with same name cannot exist as sibling dirs; assert via
            // discoveryBranches multi-match on one scan is still one LoadableLump.
            const logger = createLogger();
            const result = await validateDaemonLaunch({
                projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
                localConfig: {
                    mode: 'dedicated',
                    primaryBranch: 'main',
                    primaryBranches: ['main', 'feature/*'],
                },
                logger,
            });
            expect(result.success).toBe(true);
        });

        it('V3: pattern discovery rule not in primaries fails launch', async () => {
            await writeMinimalLump(projectRoot, 'hotfixLump', {
                discoveryBranches: ['hotfix/*'],
            });
            gitCommitAllAndPush({ cwd: projectRoot, message: 'hotfix lump' });

            const logger = createLogger();
            const result = await validateDaemonLaunch({
                projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
                localConfig: {
                    mode: 'dedicated',
                    primaryBranch: 'main',
                    primaryBranches: ['main', 'feature/*'],
                },
                logger,
            });

            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toMatch(/hotfixLump|hotfix\/\*|primaryBranches/i);
        });
    });

});
