import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import type { Logger } from '@lumpcode/core';
import * as core from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import {
    createIntegrationBranch,
    gitCurrentBranch,
    initBareRemoteAndCheckout,
    writeLocalJson,
    writeMinimalLump,
} from '../../testing';
import { discoverDedicatedLumpsForScanBranch } from './main';
import { gitCommitAllAndPush } from '../gitCommitAllAndPush';
import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { writeJsonFile } from '../writeJsonFile';

function createLogger(): Logger {
    return {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        verbose: vi.fn(),
        child: () => createLogger(),
    };
}

describe('discoverDedicatedLumpsForScanBranch', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        ({ projectRoot, remoteDir, globalConfigFolderPath, localConfigFolderPath } = await createTempTestDirs({ prefix: 'lump-discover-dedicated-' }));
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        });
        await writeJsonFile({ filePath: path.join(localConfigFolderPath, 'project.json'), data: { projectName: 'discover-dedicated-test' } });
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, remoteDir, globalConfigFolderPath });
    });

    async function seedBranchOnlyFixtures(): Promise<void> {
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
    }

    it('returns mainLine only when scanBranch is main', async () => {
        await seedBranchOnlyFixtures();
        expect(gitCurrentBranch(projectRoot)).toBe('main');

        const result = await discoverDedicatedLumpsForScanBranch({
            scanBranch: 'main',
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'ver/0.0.9'],
                workspaceStrategy: 'checkout',
            },
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error(`unreachable: ${result.data}`);
        expect(result.data.map((l) => l.lumpName)).toEqual(['mainLine']);
    });

    it('returns releaseLine only when scanBranch is ver/0.0.9', async () => {
        await seedBranchOnlyFixtures();
        expect(gitCurrentBranch(projectRoot)).toBe('main');

        const result = await discoverDedicatedLumpsForScanBranch({
            scanBranch: 'ver/0.0.9',
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'ver/0.0.9'],
                workspaceStrategy: 'checkout',
            },
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error(`unreachable: ${result.data}`);
        expect(result.data.map((l) => l.lumpName)).toEqual(['releaseLine']);
        expect(gitCurrentBranch(projectRoot)).toBe('ver/0.0.9');
    });
});

/**
 * dynamic-discovery-branch D1–D3.
 * Pattern-match eligibility for discoveryBranches. Fixture uses `main` as exact primary.
 * Skipped until discover filters by rule match (exact or glob).
 */
describe('discoverDedicatedLumpsForScanBranch patterns (dynamic-discovery-branch D*)', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        ({ projectRoot, remoteDir, globalConfigFolderPath, localConfigFolderPath } = await createTempTestDirs({ prefix: 'lump-discover-pattern-' }));
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'project.json'),
            data: { projectName: 'discover-pattern-test' },
        });
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, remoteDir, globalConfigFolderPath });
    });

    async function seedMultiAndExactLumps(): Promise<void> {
        await writeMinimalLump(projectRoot, 'multiLine', {
            discoveryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'mainOnly', { discoveryBranch: 'main' });
        gitCommitAllAndPush({ cwd: projectRoot, message: 'multi + mainOnly' });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'feature/a',
        });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'release/1',
        });
    }

    it('D1: scan main returns multi-line and exact-main lumps; excludes feature-only', async () => {
        await seedMultiAndExactLumps();
        await writeMinimalLump(projectRoot, 'featureOnly', { discoveryBranch: 'feature/*' });
        gitCommitAllAndPush({ cwd: projectRoot, message: 'add featureOnly' });

        const result = await discoverDedicatedLumpsForScanBranch({
            scanBranch: 'main',
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
                workspaceStrategy: 'checkout',
            },
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error(`unreachable: ${result.data}`);
        const names = result.data.map((l) => l.lumpName).sort();
        expect(names).toContain('multiLine');
        expect(names).toContain('mainOnly');
        expect(names).not.toContain('featureOnly');
    });

    it('D2: scan feature/a returns multi-line; excludes main-only', async () => {
        await seedMultiAndExactLumps();

        const result = await discoverDedicatedLumpsForScanBranch({
            scanBranch: 'feature/a',
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
                workspaceStrategy: 'checkout',
            },
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error(`unreachable: ${result.data}`);
        const names = result.data.map((l) => l.lumpName);
        expect(names).toContain('multiLine');
        expect(names).not.toContain('mainOnly');
    });

    it('D3: scan non-match omits multi-line lump', async () => {
        await seedMultiAndExactLumps();

        const result = await discoverDedicatedLumpsForScanBranch({
            scanBranch: 'release/1',
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*', 'release/1'],
                workspaceStrategy: 'checkout',
            },
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error(`unreachable: ${result.data}`);
        expect(result.data.map((l) => l.lumpName)).not.toContain('multiLine');
    });
});

function branchMarkerRefreshCommand(markerName: string): string {
    const script = `require('fs').writeFileSync(${JSON.stringify(markerName)}, require('child_process').execSync('git rev-parse --abbrev-ref HEAD',{encoding:'utf8'}).trim())`;
    return `node -e ${JSON.stringify(script)}`;
}

type DiscoverWithRefresh = Parameters<typeof discoverDedicatedLumpsForScanBranch>[0] & {
    refreshCommand?: string;
};

describe('discoverDedicatedLumpsForScanBranch (daemon-primary-branch-refresh-command R*)', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        ({ projectRoot, remoteDir, globalConfigFolderPath, localConfigFolderPath } = await createTempTestDirs({
            prefix: 'lump-discover-refresh-',
        }));
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        });
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'project.json'),
            data: { projectName: 'discover-refresh-test' },
        });
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, remoteDir, globalConfigFolderPath });
    });

    async function seedBranchOnlyFixtures(): Promise<void> {
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
    }

    const dedicatedLocal = {
        mode: 'dedicated' as const,
        primaryBranch: 'main',
        primaryBranches: ['main', 'ver/0.0.9'],
        workspaceStrategy: 'checkout' as const,
    };

    it('R1: refreshCommand runs on main after checkout; logs start and ok', async () => {
        await seedBranchOnlyFixtures();
        const logger = createLogger();
        const markerName = 'refresh.marker';
        const input: DiscoverWithRefresh = {
            scanBranch: 'main',
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: dedicatedLocal,
            logger,
            refreshCommand: branchMarkerRefreshCommand(markerName),
        };

        const result = await discoverDedicatedLumpsForScanBranch(input);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(`unreachable: ${result.data}`);
        expect(result.data.map((l) => l.lumpName)).toEqual(['mainLine']);

        const marker = await fs.readFile(path.join(projectRoot, markerName), 'utf-8');
        expect(marker.trim()).toBe('main');

        const infoLines = (logger.info as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
        expect(infoLines.some((line) => /refreshCommand on "main":/.test(line))).toBe(true);
        expect(infoLines.some((line) => line === 'refreshCommand on "main": ok')).toBe(true);
    });

    it('R2: refreshCommand runs after checkout onto scanBranch', async () => {
        await seedBranchOnlyFixtures();
        const markerName = 'refresh.marker';
        const input: DiscoverWithRefresh = {
            scanBranch: 'ver/0.0.9',
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: dedicatedLocal,
            logger: createLogger(),
            refreshCommand: branchMarkerRefreshCommand(markerName),
        };

        const result = await discoverDedicatedLumpsForScanBranch(input);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(`unreachable: ${result.data}`);
        expect(result.data.map((l) => l.lumpName)).toEqual(['releaseLine']);

        const marker = await fs.readFile(path.join(projectRoot, markerName), 'utf-8');
        expect(marker.trim()).toBe('ver/0.0.9');
    });

    it('R3: refreshCommand failure skips discovery for that scan branch', async () => {
        await seedBranchOnlyFixtures();
        const input: DiscoverWithRefresh = {
            scanBranch: 'main',
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: dedicatedLocal,
            logger: createLogger(),
            refreshCommand: 'node -e "process.exit(1)"',
        };

        const result = await discoverDedicatedLumpsForScanBranch(input);
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/refreshCommand failed on "main"/);
    });

    it('R4: omitted refreshCommand does not exec a refresh', async () => {
        await seedBranchOnlyFixtures();
        const markerPath = path.join(projectRoot, 'refresh.marker');

        const result = await discoverDedicatedLumpsForScanBranch({
            scanBranch: 'main',
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: dedicatedLocal,
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error(`unreachable: ${result.data}`);
        expect(result.data.map((l) => l.lumpName)).toEqual(['mainLine']);
        await expect(fs.access(markerPath)).rejects.toThrow();
    });

    it('R5: execBinary uses shell wrapper, cwd, 15m timeout, stdio ignore', async () => {
        await seedBranchOnlyFixtures();
        const execSpy = vi.spyOn(core, 'execBinary').mockResolvedValue(success({ stdout: '', stderr: '' }));
        const isWin = process.platform === 'win32';

        try {
            const input: DiscoverWithRefresh = {
                scanBranch: 'main',
                sourceProjectRoot: projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
                localConfig: dedicatedLocal,
                logger: createLogger(),
                refreshCommand: 'npm i',
            };
            const result = await discoverDedicatedLumpsForScanBranch(input);
            expect(result.success).toBe(true);
            expect(execSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    binaryPath: isWin ? 'cmd.exe' : '/bin/sh',
                    args: isWin ? ['/d', '/s', '/c', 'npm i'] : ['-c', 'npm i'],
                    cwd: projectRoot,
                    timeoutMillis: 900_000,
                    stdio: 'ignore',
                }),
            );
        } finally {
            execSpy.mockRestore();
        }
    });

    it('R6: execBinary timeout is a scan-branch Failure', async () => {
        await seedBranchOnlyFixtures();
        const execSpy = vi.spyOn(core, 'execBinary').mockResolvedValue(
            failure({
                message: 'Process timed out after 900000 milliseconds',
                binaryPath: '/bin/sh',
                args: ['-c', 'npm i'],
                reason: 'timeout' as const,
            }),
        );

        try {
            const input: DiscoverWithRefresh = {
                scanBranch: 'main',
                sourceProjectRoot: projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
                localConfig: dedicatedLocal,
                logger: createLogger(),
                refreshCommand: 'npm i',
            };
            const result = await discoverDedicatedLumpsForScanBranch(input);
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toMatch(/refreshCommand failed on "main"/);
            expect(result.data).toMatch(/timed out/i);
        } finally {
            execSpy.mockRestore();
        }
    });
});
