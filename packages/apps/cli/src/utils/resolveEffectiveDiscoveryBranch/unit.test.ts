import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '@lumpcode/core';

import {
    initBareRemoteAndCheckout,
    writeLocalJson,
    writeMinimalLump,
} from '../../testing';
import { gitCommitAllAndPush } from '../gitCommitAllAndPush';
import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { writeJsonFile } from '../writeJsonFile';
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
        ({ projectRoot, remoteDir, localConfigFolderPath } = await createTempTestDirs({ prefix: 'lump-eff-discovery-', global: false }));
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'project.json'),
            data: { projectName: 'eff-discovery-test' },
        });
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, remoteDir });
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
        gitCommitAllAndPush({ cwd: projectRoot, message: 'multi lump' });

        const result = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt: 'feature/a',
            lumpName: 'multi',
            localConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
                workspaceStrategy: 'checkout',
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
        gitCommitAllAndPush({ cwd: projectRoot, message: 'multi lump' });

        const result = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt: 'feature/*',
            lumpName: 'multi',
            localConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
                workspaceStrategy: 'checkout',
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
        gitCommitAllAndPush({ cwd: projectRoot, message: 'multi lump' });

        const result = await resolveEffectiveDiscoveryBranch({
            lumpName: 'multi',
            localConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
                workspaceStrategy: 'checkout',
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
        gitCommitAllAndPush({ cwd: projectRoot, message: 'pattern-only lump' });

        const result = await resolveEffectiveDiscoveryBranch({
            lumpName: 'patternOnly',
            localConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
                workspaceStrategy: 'checkout',
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
        gitCommitAllAndPush({ cwd: projectRoot, message: 'feature-only lump' });

        const result = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt: 'main',
            lumpName: 'featureOnly',
            localConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
                workspaceStrategy: 'checkout',
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
        gitCommitAllAndPush({ cwd: projectRoot, message: 'shared lump' });
        const logger = createLogger();

        const result = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt: 'feature/a',
            lumpName: 'sharedLump',
            localConfigFolderPath,
            localConfig: { mode: 'shared', primaryBranch: 'main', workspaceStrategy: 'checkout' },
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
        gitCommitAllAndPush({ cwd: projectRoot, message: 'multi lump' });

        const result = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt: 'ver/x',
            lumpName: 'multi',
            localConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
                workspaceStrategy: 'checkout',
            },
            logger: createLogger(),
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/primaryBranches|ver\/x|discoveryBranch/i);
    });

    it('E8: shared honor returns matching concrete flag without allowlist', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'shared',
            primaryBranch: 'main',
        });
        await writeMinimalLump(projectRoot, 'multi', {
            discoveryBranches: ['main', 'feature/*'],
        });
        gitCommitAllAndPush({ cwd: projectRoot, message: 'multi lump' });

        const result = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt: 'feature/a',
            lumpName: 'multi',
            localConfigFolderPath,
            localConfig: { mode: 'shared', primaryBranch: 'main', workspaceStrategy: 'checkout' },
            honorDiscoveryBranchOptInShared: true,
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toBe('feature/a');
    });

    it('E9: shared honor rejects glob flag', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'shared',
            primaryBranch: 'main',
        });
        await writeMinimalLump(projectRoot, 'multi', {
            discoveryBranches: ['main', 'feature/*'],
        });
        gitCommitAllAndPush({ cwd: projectRoot, message: 'multi lump' });

        const result = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt: 'feature/*',
            lumpName: 'multi',
            localConfigFolderPath,
            localConfig: { mode: 'shared', primaryBranch: 'main', workspaceStrategy: 'checkout' },
            honorDiscoveryBranchOptInShared: true,
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/concrete|pattern|discoveryBranch/i);
    });

    it('E10: shared honor rejects flag that mismatches lump discovery rules', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'shared',
            primaryBranch: 'main',
        });
        await writeMinimalLump(projectRoot, 'featureOnly', {
            discoveryBranch: 'feature/*',
        });
        gitCommitAllAndPush({ cwd: projectRoot, message: 'feature-only lump' });

        const result = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt: 'main',
            lumpName: 'featureOnly',
            localConfigFolderPath,
            localConfig: { mode: 'shared', primaryBranch: 'main', workspaceStrategy: 'checkout' },
            honorDiscoveryBranchOptInShared: true,
        });

        expect(result.success).toBe(false);
    });
});
