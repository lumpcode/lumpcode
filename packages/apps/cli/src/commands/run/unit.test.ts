import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as core from '@lumpcode/core';

import {
    assertCheckoutBranch,
    createIntegrationBranch,
    gitCurrentBranch,
    initBareRemoteAndCheckout,
    writeLocalJson,
    writeMinimalLump,
} from '../../testing';
import * as runProjectPreflightModule from '../../utils/runProjectPreflight';
import * as runLumpFromLumpNameModule from '../../utils/runLumpFromLumpName';
import { command } from './main';

vi.mock('@lumpcode/core', async () => {
    const actual = await vi.importActual<typeof core>('@lumpcode/core');
    return {
        ...actual,
        runLump: vi.fn(),
    };
});

describe('run command — multi discovery branches', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-cmd-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-cmd-remote-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-cmd-global-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');

        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'run-cmd-test' }),
            'utf-8',
        );
        vi.mocked(core.runLump).mockResolvedValue(
            core.success({
                result: {
                    branchName: 'lump/run-cmd-test/README',
                    contextNames: ['README'],
                    contextRunStateList: [],
                },
            } as unknown as core.RunLumpOutput),
        );
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    function makeHandler() {
        return command.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
    }

    async function setupMultiBranchLocal() {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        });
        await writeMinimalLump(projectRoot, 'releaseLine', {
            discoveryBranch: 'ver/0.0.9',
            baseBranch: 'ver/0.0.9',
        });
        execSync('git add -A', { cwd: projectRoot });
        execSync('git commit -m "main lump"', { cwd: projectRoot });
        execSync('git push origin main', { cwd: projectRoot });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'ver/0.0.9',
            extraFiles: { 'RELEASE_ONLY.txt': 'release\n' },
        });
    }

    it('fails before pre-flight when lump config is missing on current checkout', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'ver/0.0.9',
            lumpSpecs: [{
                name: 'releaseLine',
                configOverrides: { discoveryBranch: 'ver/0.0.9', baseBranch: 'ver/0.0.9' },
            }],
        });
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');

        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'releaseLine' },
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/not found|releaseLine/i);
        expect(preflightSpy).not.toHaveBeenCalled();
    });

    it('fails before pre-flight when discoveryBranch is unlisted in dedicated mode', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main'],
        });
        await writeMinimalLump(projectRoot, 'legacyLine', { discoveryBranch: 'ver/0.0.7' });
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');

        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'legacyLine' },
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/discoveryBranch|primaryBranches|ver\/0\.0\.7/i);
        expect(preflightSpy).not.toHaveBeenCalled();
    });

    it('pre-flights to lump resolvedBaseBranch and succeeds when lump declares ver/0.0.9', async () => {
        await setupMultiBranchLocal();
        assertCheckoutBranch(projectRoot, 'main');

        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'releaseLine' },
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(gitCurrentBranch(projectRoot)).toBe('main');
    });

    it('loads config in phase 1 before calling runLumpFromJsConfig', async () => {
        await setupMultiBranchLocal();
        const runLumpSpy = vi.spyOn(runLumpFromLumpNameModule, 'runLumpFromLumpName');

        await makeHandler()({
            options: {},
            arguments: { lumpName: 'releaseLine' },
        });

        expect(runLumpSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                sourceProjectRoot: projectRoot,
                lumpName: 'releaseLine',
                effectiveDiscoveryBranch: 'ver/0.0.9',
            }),
        );
    });

    it('pre-flights to resolvedBaseBranch for LUMP-SPLIT (discovery on main, execution on ver/0.0.9)', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        });
        await writeMinimalLump(projectRoot, 'splitLine', {
            discoveryBranch: 'main',
            baseBranch: 'ver/0.0.9',
        });
        await createIntegrationBranch({ projectRoot, remoteDir, branchName: 'ver/0.0.9' });

        const runLumpSpy = vi.spyOn(runLumpFromLumpNameModule, 'runLumpFromLumpName');
        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'splitLine' },
        });

        expect(result.success).toBe(true);
        expect(runLumpSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                lumpName: 'splitLine',
                sourceProjectRoot: projectRoot,
            }),
        );
    });

    it('shared mode proceeds when discoveryBranch is unlisted (no allowlist)', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'shared',
            primaryBranch: 'main',
            primaryBranches: ['main'],
        });
        await writeMinimalLump(projectRoot, 'legacyLine', { discoveryBranch: 'ver/0.0.7' });

        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'legacyLine' },
        });

        expect(result.success).toBe(true);
    });

    it('shared mode leaves source checkout on main after run', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'shared',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'ver/0.0.9',
        });
        await writeMinimalLump(projectRoot, 'releaseLine', {
            discoveryBranch: 'ver/0.0.9',
            baseBranch: 'ver/0.0.9',
        });

        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'releaseLine' },
        });

        expect(result.success).toBe(true);
        expect(gitCurrentBranch(projectRoot)).toBe('main');
    });
});

/**
 * dynamic-discovery-branch C1–C5.
 * Skipped until glob discovery rules and concrete flag binding land.
 * Fixture default branch is `main`.
 */
describe('run command — dynamic-discovery-branch (C*)', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-ddb-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-ddb-remote-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-ddb-global-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');

        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'run-ddb-test' }),
            'utf-8',
        );
        vi.mocked(core.runLump).mockResolvedValue(
            core.success({
                result: {
                    branchName: 'lump/run-ddb-test/README',
                    contextNames: ['README'],
                    contextRunStateList: [],
                },
            } as unknown as core.RunLumpOutput),
        );
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    function makeHandler() {
        return command.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
    }

    async function setupMultiRuleDedicated() {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'multi', {
            discoveryBranches: ['main', 'feature/*'],
        });
        execSync('git add -A', { cwd: projectRoot });
        execSync('git commit -m "multi lump"', { cwd: projectRoot });
        execSync('git push origin main', { cwd: projectRoot });
    }

    it('C1: flagless multi-rule lump uses first exact discovery (main)', async () => {
        await setupMultiRuleDedicated();
        const runLumpSpy = vi.spyOn(runLumpFromLumpNameModule, 'runLumpFromLumpName');

        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'multi' },
        });

        expect(result.success).toBe(true);
        expect(runLumpSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                lumpName: 'multi',
                effectiveDiscoveryBranch: 'main',
            }),
        );
    });

    it('C2: pattern-only lump without flag fails before preflight', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'patternOnly', { discoveryBranch: 'feature/*' });
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');

        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'patternOnly' },
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/--discoveryBranch/);
        expect(preflightSpy).not.toHaveBeenCalled();
    });

    it('C3: --discoveryBranch feature/a reaches runLumpFromLumpName with concrete discovery', async () => {
        await setupMultiRuleDedicated();
        await createIntegrationBranch({ projectRoot, remoteDir, branchName: 'feature/a' });
        const runLumpSpy = vi.spyOn(runLumpFromLumpNameModule, 'runLumpFromLumpName');

        const result = await makeHandler()({
            options: { discoveryBranch: 'feature/a' },
            arguments: { lumpName: 'multi' },
        });

        expect(result.success).toBe(true);
        expect(runLumpSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                lumpName: 'multi',
                effectiveDiscoveryBranch: 'feature/a',
            }),
        );
    });

    it('C4: --discoveryBranch feature/* fails (concrete-only flag)', async () => {
        await setupMultiRuleDedicated();

        const result = await makeHandler()({
            options: { discoveryBranch: 'feature/*' },
            arguments: { lumpName: 'multi' },
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/concrete|pattern|discoveryBranch/i);
    });

    it('C5: shared mode warn-and-ignores flag; does not fail for unlisted discovery', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'shared',
            primaryBranch: 'main',
            primaryBranches: ['main'],
        });
        await writeMinimalLump(projectRoot, 'legacyLine', { discoveryBranch: 'ver/0.0.7' });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        try {
            const result = await makeHandler()({
                options: { discoveryBranch: 'feature/a' },
                arguments: { lumpName: 'legacyLine' },
            });

            expect(result.success).toBe(true);
            const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls].map((c) => String(c[0])).join('\n');
            expect(logged).toMatch(/discoveryBranch|ignored|shared/i);
        } finally {
            logSpy.mockRestore();
            warnSpy.mockRestore();
        }
    });
});

/**
 * Target abort wiring for kill-spawned-command-on-timeout-abort.
 * Skipped until run owns an AbortController and passes signal into runLumpFromLumpName.
 */
describe('run command abort signal wiring (W2)', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-signal-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-signal-remote-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-signal-global-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');

        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'run-signal-test' }),
            'utf-8',
        );
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
        });
        await writeMinimalLump(projectRoot, 'signalLump');
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('W2: run handler passes a live AbortSignal into runLumpFromLumpName', async () => {
        const spy = vi.spyOn(runLumpFromLumpNameModule, 'runLumpFromLumpName').mockResolvedValue(
            core.success({
                skipped: false,
                result: {
                    branchName: 'lump/signalLump/ctx',
                    contextNames: ['ctx'],
                    contextRunStateList: [],
                },
            }) as Awaited<ReturnType<typeof runLumpFromLumpNameModule.runLumpFromLumpName>>,
        );

        const handle = command.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
        const result = await handle({
            options: {},
            arguments: { lumpName: 'signalLump' },
        });

        expect(result.success).toBe(true);
        expect(spy).toHaveBeenCalled();
        const callArg = spy.mock.calls[0]?.[0] as { signal?: AbortSignal };
        expect(callArg.signal).toBeInstanceOf(AbortSignal);
        expect(callArg.signal?.aborted).toBe(false);
    });
});
