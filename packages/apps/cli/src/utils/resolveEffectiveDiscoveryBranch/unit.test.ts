import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '@lumpcode/core';

import {
    initBareRemoteAndCheckout,
    writeLocalJson,
    writeMinimalLump,
} from '../../testing';
import { resolveEffectiveDiscoveryBranch } from './main';

function createLogger(): Logger {
    return {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        verbose: vi.fn(),
        child: () => createLogger(),
    };
}

function gitCommitAll(cwd: string, message: string): void {
    execSync('git add -A', { cwd, stdio: 'pipe' });
    try {
        execSync(`git commit -m ${JSON.stringify(message)}`, { cwd, stdio: 'pipe' });
    } catch {
        execSync(`git commit --allow-empty -m ${JSON.stringify(message)}`, { cwd, stdio: 'pipe' });
    }
    execSync('git push origin main', { cwd, stdio: 'pipe' });
}

/**
 * dynamic-discovery-branch E1–E7.
 * Skipped until concrete-flag / first-exact / pattern-only rules land.
 * Fixture default branch is `main`.
 */
describe('resolveEffectiveDiscoveryBranch (dynamic-discovery-branch E*)', () => {
    let projectRoot: string;
    let remoteDir: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-eff-discovery-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-eff-discovery-remote-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'eff-discovery-test' }),
            'utf-8',
        );
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
    });

    it('E1: dedicated concrete flag allowlisted and matching lump', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'multi', {
            discoveryBranches: ['main', 'feature/*'],
        });
        gitCommitAll(projectRoot, 'multi lump');

        const result = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt: 'feature/a',
            lumpName: 'multi',
            localConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
            },
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toBe('feature/a');
    });

    it('E2: dedicated flag that is a pattern fails (concrete-only)', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'multi', {
            discoveryBranches: ['main', 'feature/*'],
        });
        gitCommitAll(projectRoot, 'multi lump');

        const result = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt: 'feature/*',
            lumpName: 'multi',
            localConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
            },
            logger: createLogger(),
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/concrete|pattern|discoveryBranch/i);
    });

    it('E3: flagless uses first exact discovery rule', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'multi', {
            discoveryBranches: ['main', 'feature/*'],
        });
        gitCommitAll(projectRoot, 'multi lump');

        const result = await resolveEffectiveDiscoveryBranch({
            lumpName: 'multi',
            localConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
            },
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toBe('main');
    });

    it('E4: flagless pattern-only fails asking for --discoveryBranch', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'patternOnly', {
            discoveryBranch: 'feature/*',
        });
        gitCommitAll(projectRoot, 'pattern-only lump');

        const result = await resolveEffectiveDiscoveryBranch({
            lumpName: 'patternOnly',
            localConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
            },
            logger: createLogger(),
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/--discoveryBranch/);
    });

    it('E5: flag that mismatches lump rules fails', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'featureOnly', {
            discoveryBranch: 'feature/*',
        });
        gitCommitAll(projectRoot, 'feature-only lump');

        const result = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt: 'main',
            lumpName: 'featureOnly',
            localConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
            },
            logger: createLogger(),
        });

        expect(result.success).toBe(false);
    });

    it('E6: shared mode warn-and-ignores flag', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'shared',
            primaryBranch: 'main',
        });
        await writeMinimalLump(projectRoot, 'sharedLump', {});
        gitCommitAll(projectRoot, 'shared lump');
        const logger = createLogger();

        const result = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt: 'feature/a',
            lumpName: 'sharedLump',
            localConfigFolderPath,
            localConfig: { mode: 'shared', primaryBranch: 'main' },
            logger,
            warnSharedDiscoveryBranchIgnored: true,
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toBe('main');
        expect(logger.info).toHaveBeenCalled();
    });

    it('E7: dedicated flag not covered by primaries fails allowlist', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'multi', {
            discoveryBranches: ['main', 'feature/*'],
        });
        gitCommitAll(projectRoot, 'multi lump');

        const result = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt: 'ver/x',
            lumpName: 'multi',
            localConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
            },
            logger: createLogger(),
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/primaryBranches|ver\/x|discoveryBranch/i);
    });
});
