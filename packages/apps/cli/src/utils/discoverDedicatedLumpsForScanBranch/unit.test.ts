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

/**
 * dynamic-discovery-branch D1–D3.
 * Pattern-match eligibility for discoveryBranches. Fixture uses `main` as exact primary.
 * Skipped until discover filters by rule match (exact or glob).
 */
describe.skip('discoverDedicatedLumpsForScanBranch patterns (dynamic-discovery-branch D*)', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-discover-pattern-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-discover-pattern-remote-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-discover-pattern-global-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'discover-pattern-test' }),
            'utf-8',
        );
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    async function seedMultiAndExactLumps(): Promise<void> {
        await writeMinimalLump(projectRoot, 'multiLine', {
            discoveryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'mainOnly', { discoveryBranch: 'main' });
        gitCommitAll(projectRoot, 'multi + mainOnly');
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
        gitCommitAll(projectRoot, 'add featureOnly');

        const result = await discoverDedicatedLumpsForScanBranch({
            scanBranch: 'main',
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
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
            },
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error(`unreachable: ${result.data}`);
        expect(result.data.map((l) => l.lumpName)).not.toContain('multiLine');
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
