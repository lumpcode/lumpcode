import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { failure, success } from '@lumpcode/core';

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
    runLumpSuccess,
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
            const byName = new Map(
                runLumpSpy.mock.calls.map((c) => [c[0].lumpName as string, c[0]] as const),
            );
            expect(byName.has('mainLine')).toBe(true);
            expect(byName.has('releaseLine')).toBe(true);
            // Merged queue runs after all scans; must pass the scan-time discovery branch
            // so branch-only configs resolve without relying on the current checkout.
            expect(byName.get('mainLine')?.effectiveDiscoveryBranch).toBe('main');
            expect(byName.get('releaseLine')?.effectiveDiscoveryBranch).toBe('ver/0.0.9');
            const releaseCallIndex = runLumpSpy.mock.calls.findIndex(
                (c) => c[0].lumpName === 'releaseLine',
            );
            const releaseCall = runLumpSpy.mock.results[releaseCallIndex];
            expect(releaseCall?.type).toBe('return');
            const releaseResult = await (releaseCall?.value as Promise<{ success: boolean }>);
            expect(releaseResult.success).toBe(true);
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

/**
 * dynamic-discovery-branch T1–T4, S1, S3.
 * Skipped until primaryBranches glob expand and per-scan fan-out land.
 * Fixture default branch is `main`.
 */
describe('start command — dynamic-discovery-branch (T*, S*)', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        const project = await setupStartTestRepo({
            tmpPrefix: 'lump-start-ddb',
            projectName: 'ddb-daemon-project',
        });
        projectRoot = project.projectRoot;
        remoteDir = project.remoteDir;
        globalConfigFolderPath = project.globalConfigFolderPath;
    });

    afterEach(async () => {
        await teardownStartTestRepo({ projectRoot, remoteDir, globalConfigFolderPath });
        vi.restoreAllMocks();
    });

    const deps = () => ({ projectRoot, remoteDir, globalConfigFolderPath });

    it('T1: tick expands main then feature/a; multi-line lump runs twice with distinct discovery', async () => {
        await writeLocalJson(localConfigFolderPath(projectRoot), {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'multiLine', {
            discoveryBranches: ['main', 'feature/*'],
        });
        execGit('add -A', projectRoot);
        execGit('commit -m "multiLine on main"', projectRoot);
        execGit('push origin main', projectRoot);
        await createIntegrationBranch({ projectRoot, remoteDir, branchName: 'feature/a' });

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
            const result = await makeStartHandler(deps(), { waitForShutdownOverride: async () => {} })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            expect(result.success).toBe(true);
            const scanBranches = discoverSpy.mock.calls.map((c) => c[0].scanBranch);
            expect(scanBranches).toContain('main');
            expect(scanBranches).toContain('feature/a');

            const multiRuns = runLumpSpy.mock.calls.filter((c) => c[0].lumpName === 'multiLine');
            expect(multiRuns.length).toBeGreaterThanOrEqual(2);
            const discoveries = multiRuns.map((c) => c[0].effectiveDiscoveryBranch);
            expect(discoveries).toContain('main');
            expect(discoveries).toContain('feature/a');
        } finally {
            discoverSpy.mockRestore();
            runLumpSpy.mockRestore();
        }
    });

    it('T2: same lumpName eligible on two scan branches launches and tick runs both', async () => {
        await writeLocalJson(localConfigFolderPath(projectRoot), {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'sharedName', {
            discoveryBranches: ['main', 'feature/*'],
        });
        execGit('add -A', projectRoot);
        execGit('commit -m "sharedName on main"', projectRoot);
        execGit('push origin main', projectRoot);
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'feature/a',
            lumpSpecs: [{
                name: 'sharedName',
                configOverrides: { discoveryBranches: ['main', 'feature/*'] },
            }],
        });

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
            const result = await makeStartHandler(deps(), { waitForShutdownOverride: async () => {} })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            expect(result.success).toBe(true);
            const sharedRuns = runLumpSpy.mock.calls.filter((c) => c[0].lumpName === 'sharedName');
            expect(sharedRuns.length).toBeGreaterThanOrEqual(2);
            const discoveries = sharedRuns.map((c) => c[0].effectiveDiscoveryBranch);
            expect(discoveries).toContain('main');
            expect(discoveries).toContain('feature/a');
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('T3: expand failure fails launch when glob expansion is required', async () => {
        await writeLocalJson(localConfigFolderPath(projectRoot), {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'mainLine', { discoveryBranch: 'main' });
        execGit('add -A', projectRoot);
        execGit('commit -m "mainLine"', projectRoot);
        execGit('push origin main', projectRoot);

        vi.spyOn(
            await import('../../../utils/expandPrimaryBranches'),
            'expandPrimaryBranches',
        ).mockResolvedValue(failure('ls-remote failed while expanding feature/*'));

        const result = await makeStartHandler(deps())({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/expand|ls-remote|feature/i);
    });

    it('T4: empty feature/* glob yields exact-only scan set without crash', async () => {
        await writeLocalJson(localConfigFolderPath(projectRoot), {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'mainLine', { discoveryBranch: 'main' });
        execGit('add -A', projectRoot);
        execGit('commit -m "mainLine"', projectRoot);
        execGit('push origin main', projectRoot);

        const discoverSpy = vi.spyOn(
            await import('../../../utils/discoverDedicatedLumpsForScanBranch'),
            'discoverDedicatedLumpsForScanBranch',
        );
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        try {
            const result = await makeStartHandler(deps(), { waitForShutdownOverride: async () => {} })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            expect(result.success).toBe(true);
            const scanBranches = discoverSpy.mock.calls.map((c) => c[0].scanBranch);
            expect(scanBranches.filter((b) => b !== 'main')).toHaveLength(0);
        } finally {
            discoverSpy.mockRestore();
            logSpy.mockRestore();
            warnSpy.mockRestore();
        }
    });

    it('S1: shared mode does not fan-out scan across feature/* primaryBranches', async () => {
        await writeLocalJson(localConfigFolderPath(projectRoot), {
            mode: 'shared',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'mainLine');
        await createIntegrationBranch({ projectRoot, remoteDir, branchName: 'feature/a' });

        const discoverSpy = vi.spyOn(
            await import('../../../utils/discoverDedicatedLumpsForScanBranch'),
            'discoverDedicatedLumpsForScanBranch',
        );
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        try {
            const result = await makeStartHandler(deps(), { waitForShutdownOverride: async () => {} })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            expect(result.success).toBe(true);
            const featureScans = discoverSpy.mock.calls
                .map((c) => c[0].scanBranch)
                .filter((b) => b.startsWith('feature/'));
            expect(featureScans).toHaveLength(0);
            const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls].map((c) => String(c[0])).join('\n');
            expect(logged).toMatch(/multi.*discovery|dedicated/i);
        } finally {
            discoverSpy.mockRestore();
            logSpy.mockRestore();
            warnSpy.mockRestore();
        }
    });

});

/**
 * daemon-id-and-filters D1.
 * Skipped until filtered daemons still multi-primary discover (no start --discoveryBranch).
 * S3 (shared start --lumpName + --discoveryBranch warn) deleted — flag removed from start.
 */
describe('start command — filtered multi-primary (daemon-id-and-filters D*)', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        const project = await setupStartTestRepo({
            tmpPrefix: 'lump-start-d',
            projectName: 'daemon-filters-d-project',
        });
        projectRoot = project.projectRoot;
        remoteDir = project.remoteDir;
        globalConfigFolderPath = project.globalConfigFolderPath;
    });

    afterEach(async () => {
        await teardownStartTestRepo({ projectRoot, remoteDir, globalConfigFolderPath });
        vi.restoreAllMocks();
    });

    const deps = () => ({ projectRoot, remoteDir, globalConfigFolderPath });

    it('D1: filtered daemon still scans all primaries', async () => {
        await writeLocalJson(localConfigFolderPath(projectRoot), {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
            workspaceStrategy: 'worktree',
        });
        await writeMinimalLump(projectRoot, 'mainLine', { discoveryBranch: 'main' });
        execGit('add -A', projectRoot);
        execGit('commit -m "mainLine"', projectRoot);
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

        const started: { lumpName: string; effectiveDiscoveryBranch?: string }[] = [];
        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockImplementation(async (input) => {
                started.push({
                    lumpName: input.lumpName,
                    effectiveDiscoveryBranch: input.effectiveDiscoveryBranch,
                });
                return runLumpSuccess;
            });

        try {
            const result = await makeStartHandler(deps(), {
                waitForShutdownOverride: async () => {},
            })({
                options: {
                    include: 'releaseLine',
                    foreground: true,
                    cronSetup: '*/5 * * * *',
                } as never,
                arguments: {},
            });
            expect(result.success).toBe(true);
            expect(started.some((s) => s.lumpName === 'releaseLine')).toBe(true);
            const release = started.find((s) => s.lumpName === 'releaseLine');
            expect(release?.effectiveDiscoveryBranch).toBe('ver/0.0.9');
            expect(started.some((s) => s.lumpName === 'mainLine')).toBe(false);
        } finally {
            runLumpSpy.mockRestore();
        }
    });
});
