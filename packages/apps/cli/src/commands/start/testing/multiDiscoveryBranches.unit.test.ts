import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { success } from '@lumpcode/core';

import {
    createIntegrationBranch,
    writeLocalJson,
    writeMinimalLump,
} from '../../../testing';
import * as runProjectPreflightModule from '../../../utils/runProjectPreflight';
import { execGit } from '../../../utils/execGit';
import {
    localConfigFolderPath,
    makeStartHandler,
    setupStartTestRepo,
    teardownStartTestRepo,
    writeDedicatedLocal,
} from './testHelpers';

describe('start command — multi discovery branches', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        const project = await setupStartTestRepo({ tmpPrefix: 'lump-start-mbb', projectName: 'mbb-daemon-project' });
        projectRoot = project.projectRoot;
        remoteDir = project.remoteDir;
        globalConfigFolderPath = project.globalConfigFolderPath;
    });

    afterEach(async () => {
        await teardownStartTestRepo({ projectRoot, remoteDir, globalConfigFolderPath });
        vi.restoreAllMocks();
    });
    const deps = () => ({ projectRoot, remoteDir, globalConfigFolderPath });
    async function writeMultiLocal(overrides: Record<string, unknown> = {}) {
        await writeDedicatedLocal(projectRoot, {
            primaryBranches: ['main', 'ver/0.0.9'],
            ...overrides,
        });
    }

    async function seedMainAndReleaseLumps() {
        await writeMinimalLump(projectRoot, 'mainLine', { discoveryBranch: 'main' });
        await writeMinimalLump(projectRoot, 'releaseLine', {
            discoveryBranch: 'ver/0.0.9',
            baseBranch: 'ver/0.0.9',
        });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'ver/0.0.9',
        });
    }

    it('succeeds launch with lumps on main and ver/0.0.9 (LC-MULTI)', async () => {
        await writeMultiLocal();
        await seedMainAndReleaseLumps();

        const result = await makeStartHandler(deps(), { waitForShutdownOverride: async () => {} })({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
        expect(result.success).toBe(true);
    });

    it('succeeds launch when the same lumpName exists on two discovery branches (sharedName)', async () => {
        await writeMultiLocal();
        await writeMinimalLump(projectRoot, 'sharedName', { discoveryBranch: 'main' });
        execGit('add -A', projectRoot);
        execGit('commit -m "same on main"', projectRoot);
        execGit('push origin main', projectRoot);
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'ver/0.0.9',
            lumpSpecs: [{ name: 'sharedName', configOverrides: { discoveryBranch: 'ver/0.0.9' } }],
        });

        const result = await makeStartHandler(deps(), { waitForShutdownOverride: async () => {} })({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
        expect(result.success).toBe(true);
    });

    it('fails launch when a discovery branch in primaryBranches is missing on remote', async () => {
        await writeMultiLocal();
        await writeMinimalLump(projectRoot, 'mainLine', { discoveryBranch: 'main' });
        execGit('add -A', projectRoot);
        execGit('commit -m "mainLine on main"', projectRoot);
        execGit('push origin main', projectRoot);

        const result = await makeStartHandler(deps())({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/ver\/0\.0\.9|Discovery branch/i);
    });

    it('warns and launches when a branch has unloadable lump config', async () => {
        await writeMultiLocal();
        await writeMinimalLump(projectRoot, 'mainLine');
        const badLineDir = path.join(projectRoot, '.lumpcode', 'lumps', 'badLine');
        await fs.mkdir(badLineDir, { recursive: true });
        await fs.writeFile(path.join(badLineDir, 'config.json'), JSON.stringify({ notValid: true }), 'utf-8');
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'ver/0.0.9',
        });

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const result = await makeStartHandler(deps(), { waitForShutdownOverride: async () => {} })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });
            expect(result.success).toBe(true);
            const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls].map((c) => String(c[0])).join('\n');
            expect(logged).toMatch(/badLine/i);
            expect(logged).toMatch(/skipping/i);
        } finally {
            logSpy.mockRestore();
            warnSpy.mockRestore();
        }
    });

    it('warns on cross-lump baseBranch mismatch but still launches', async () => {
        await writeMultiLocal();
        await writeMinimalLump(projectRoot, 'consumer', {
            contextListJson: { ctx: 'README' },
            dependsOnContexts: ['provider/ctx'],
        });
        await writeMinimalLump(projectRoot, 'provider', { baseBranch: 'ver/0.0.9' });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'ver/0.0.9',
        });

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const result = await makeStartHandler(deps(), { waitForShutdownOverride: async () => {} })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });
            expect(result.success).toBe(true);
            const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls].map((c) => String(c[0])).join('\n');
            expect(logged).toMatch(/provider/i);
            expect(logged).toMatch(/baseBranch|branch/i);
        } finally {
            logSpy.mockRestore();
            warnSpy.mockRestore();
        }
    });

    it('fails start --lumpName when lump discoveryBranch is not in effective list', async () => {
        await writeLocalJson(localConfigFolderPath(projectRoot), {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main'],
        });
        await writeMinimalLump(projectRoot, 'releaseLine', {
            discoveryBranch: 'ver/0.0.9',
            baseBranch: 'ver/0.0.9',
        });

        const result = await makeStartHandler(deps())({
            options: { lumpName: 'releaseLine', foreground: true },
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/ver\/0\.0\.9|discoveryBranch|primaryBranches/i);
    });

    it('succeeds start --lumpName when lump discoveryBranch is listed', async () => {
        await writeMultiLocal();
        await writeMinimalLump(projectRoot, 'releaseLine', {
            discoveryBranch: 'ver/0.0.9',
            baseBranch: 'ver/0.0.9',
        });
        await createIntegrationBranch({ projectRoot, remoteDir, branchName: 'ver/0.0.9' });

        const result = await makeStartHandler(deps(), { waitForShutdownOverride: async () => {} })({
            options: { lumpName: 'releaseLine', foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
        expect(result.success).toBe(true);
    });

    it('shared mode launch succeeds without multi-discovery branch loop', async () => {
        await writeLocalJson(localConfigFolderPath(projectRoot), {
            mode: 'shared',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        });
        await writeMinimalLump(projectRoot, 'mainLine');
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        try {
            const result = await makeStartHandler(deps(), { waitForShutdownOverride: async () => {} })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });
            expect(result.success).toBe(true);
            const targetBranches = preflightSpy.mock.calls.map((c) => c[0].targetBranch);
            expect(targetBranches.filter((b) => b === 'ver/0.0.9')).toHaveLength(0);
            const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls].map((c) => String(c[0])).join('\n');
            expect(logged).toMatch(/multi.*discovery|dedicated/i);
        } finally {
            logSpy.mockRestore();
            warnSpy.mockRestore();
        }
    });

    it('runs branch-only releaseLine when daemon starts on main checkout', async () => {
        await writeMultiLocal();
        await writeMinimalLump(projectRoot, 'mainLine', { discoveryBranch: 'main' });
        execGit('add -A', projectRoot);
        execGit('commit -m "mainLine on main"', projectRoot);
        execGit('push origin main', projectRoot);
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

        const runLumpSpy = vi.spyOn(
            await import('../../../utils/runLumpFromLumpName'),
            'runLumpFromLumpName',
        );

        try {
            const result = await makeStartHandler(deps(), { waitForShutdownOverride: async () => {} })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            expect(result.success).toBe(true);
            const lumpNames = runLumpSpy.mock.calls.map((c) => c[0].lumpName);
            expect(lumpNames).toContain('mainLine');
            expect(lumpNames).toContain('releaseLine');
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('preflights discovery branches in primaryBranches order', async () => {
        await writeLocalJson(localConfigFolderPath(projectRoot), {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['ver/0.0.9', 'main'],
        });
        await writeMinimalLump(projectRoot, 'mainLine', { discoveryBranch: 'main' });
        execGit('add -A', projectRoot);
        execGit('commit -m "mainLine on main"', projectRoot);
        execGit('push origin main', projectRoot);
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

        const discoverSpy = vi.spyOn(
            await import('../../../utils/discoverDedicatedLumpsForScanBranch'),
            'discoverDedicatedLumpsForScanBranch',
        );
        const runLumpSpy = vi.spyOn(
            await import('../../../utils/runLumpFromLumpName'),
            'runLumpFromLumpName',
        ).mockResolvedValue(
            success({
                skipped: false,
                result: {
                    branchName: '',
                    contextNames: [],
                    contextRunStateList: [],
                },
            }),
        );

        try {
            await makeStartHandler(deps(), { waitForShutdownOverride: async () => {} })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            const scanBranches = discoverSpy.mock.calls.map((c) => c[0].scanBranch);
            expect(scanBranches).toEqual(['ver/0.0.9', 'main', 'ver/0.0.9', 'main']);
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('runs lumps in discovery-branch scan order on each tick', async () => {
        await writeLocalJson(localConfigFolderPath(projectRoot), {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['ver/0.0.9', 'main'],
        });
        await writeMinimalLump(projectRoot, 'mainLine', { discoveryBranch: 'main' });
        await writeMinimalLump(projectRoot, 'releaseLine', {
            discoveryBranch: 'ver/0.0.9',
            baseBranch: 'ver/0.0.9',
        });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'ver/0.0.9',
        });

        const runLumpSpy = vi.spyOn(
            await import('../../../utils/runLumpFromLumpName'),
            'runLumpFromLumpName',
        );
        try {
            await makeStartHandler(deps(), { waitForShutdownOverride: async () => {} })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            const lumpNames = runLumpSpy.mock.calls.map((c) => c[0].lumpName);
            expect(lumpNames.indexOf('releaseLine')).toBeLessThan(lumpNames.lastIndexOf('mainLine'));
        } finally {
            runLumpSpy.mockRestore();
        }
    });
});
