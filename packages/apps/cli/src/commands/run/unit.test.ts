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
import * as runLumpFromJsConfigModule from '../../utils/runLumpFromJsConfig';
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
            discoveryBranch: 'main',
            discoveryBranches: ['main', 'ver/0.0.9'],
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
            discoveryBranch: 'main',
            discoveryBranches: ['main', 'ver/0.0.9'],
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
            discoveryBranch: 'main',
            discoveryBranches: ['main'],
        });
        await writeMinimalLump(projectRoot, 'legacyLine', { discoveryBranch: 'ver/0.0.7' });
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');

        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'legacyLine' },
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/discoveryBranch|discoveryBranches|ver\/0\.0\.7/i);
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

    it('loads config before pre-flight and passes targetBranch from resolved lump baseBranch', async () => {
        await setupMultiBranchLocal();
        const runLumpSpy = vi.spyOn(runLumpFromJsConfigModule, 'runLumpFromJsConfig');
        const getConfigSpy = vi.spyOn(
            await import('../../utils/getJsConfigFromLumpName'),
            'getJsConfigFromLumpName',
        );

        await makeHandler()({
            options: {},
            arguments: { lumpName: 'releaseLine' },
        });

        expect(getConfigSpy.mock.invocationCallOrder[0]).toBeLessThan(
            runLumpSpy.mock.invocationCallOrder[0]!,
        );
        expect(runLumpSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                sourceProjectRoot: projectRoot,
                lumpName: 'releaseLine',
            }),
        );
    });

    it('pre-flights to resolvedBaseBranch for LUMP-SPLIT (discovery on main, execution on ver/0.0.9)', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            discoveryBranch: 'main',
            discoveryBranches: ['main', 'ver/0.0.9'],
        });
        await writeMinimalLump(projectRoot, 'splitLine', {
            discoveryBranch: 'main',
            baseBranch: 'ver/0.0.9',
        });
        await createIntegrationBranch({ projectRoot, remoteDir, branchName: 'ver/0.0.9' });

        const runLumpSpy = vi.spyOn(runLumpFromJsConfigModule, 'runLumpFromJsConfig');
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
            discoveryBranch: 'main',
            discoveryBranches: ['main'],
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
            discoveryBranch: 'main',
            discoveryBranches: ['main', 'ver/0.0.9'],
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
