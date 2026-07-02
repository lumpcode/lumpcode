import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import type { Logger } from '@lumpcode/core';

import {
    createIntegrationBranch,
    gitCurrentBranch,
    initBareRemoteAndCheckout,
    writeLocalJson,
    writeMinimalLump,
} from '../../testing';
import { discoverDedicatedLumpsForScanBranch } from './main';

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
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-discover-dedicated-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-discover-dedicated-remote-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-discover-dedicated-global-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'discover-dedicated-test' }),
            'utf-8',
        );
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    async function seedBranchOnlyFixtures(): Promise<void> {
        await writeMinimalLump(projectRoot, 'mainLine', { discoveryBranch: 'main' });
        gitCommitAll(projectRoot, 'mainLine on main');
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
            },
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error(`unreachable: ${result.data}`);
        expect(result.data.map((l) => l.lumpName)).toEqual(['releaseLine']);
        expect(gitCurrentBranch(projectRoot)).toBe('ver/0.0.9');
    });
});

function gitCommitAll(cwd: string, message: string): void {
    execSync('git add -A', { cwd, stdio: 'pipe' });
    try {
        execSync(`git commit -m ${JSON.stringify(message)}`, { cwd, stdio: 'pipe' });
    } catch {
        execSync(`git commit --allow-empty -m ${JSON.stringify(message)}`, { cwd, stdio: 'pipe' });
    }
    execSync('git push origin main', { cwd, stdio: 'pipe' });
}
