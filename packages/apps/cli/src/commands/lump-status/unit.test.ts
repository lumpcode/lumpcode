import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { command } from './main';
import { contextStatusRecordPath } from '../../utils/contextStatusRecordPath';
import * as runProjectPreflightModule from '../../utils/runProjectPreflight';
import {
    createIntegrationBranch,
    gitCurrentBranch,
    initBareRemoteAndCheckout,
    writeLocalJson,
    writeMinimalLump,
} from '../../testing';
import { execGit, initLocalGitRepo } from '../../utils';
import { writeJsonFile } from '../../utils/writeJsonFile';

describe('lump-status command', () => {
    let projectRoot: string;
    let bareDir: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-'));
        bareDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-bare-'));

        execGit('init --bare', bareDir);
        initLocalGitRepo({ cwd: projectRoot });
        execGit(`remote add origin ${bareDir}`, projectRoot);
        execGit('push -u origin main', projectRoot);

        await fs.mkdir(path.join(projectRoot, '.lumpcode'), { recursive: true });
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'project.json'),
            data: { projectName: 'status-project' },
        });
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'local.json'),
            data: { mode: 'shared', primaryBranch: 'main' },
        });
    }, 60_000);

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(bareDir, { recursive: true, force: true });
    }, 60_000);

    async function writeLump(lumpName: string) {
        const lumpDir = path.join(localConfigFolderPath, 'lumps', lumpName);
        await fs.mkdir(lumpDir, { recursive: true });
        await writeJsonFile({
            filePath: path.join(lumpDir, 'config.json'),
            data: {
                baseBranch: 'main',
                contextListJson: { c1: 'README.md' },
                prompt: { promptTemplate: 'task', command: 'claude' },
            },
        });
    }

    function makeHandler() {
        return command.handlerMaker({ projectRoot, localConfigFolderPath });
    }

    it(
        'refreshes status for all lumps and writes contextStatusRecord.json',
        async () => {
        await writeLump('alpha');
        const handle = makeHandler();
        const result = await handle({
            options: {},
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data!.statusByLump.alpha).toEqual({});
        const csrPath = contextStatusRecordPath({ projectRoot, lumpName: 'alpha' });
        const onDisk = JSON.parse(await fs.readFile(csrPath, 'utf-8'));
        expect(onDisk).toEqual({});
        },
        60_000,
    );

    it(
        'scopes to --lumpName',
        async () => {
        await writeLump('a');
        await writeLump('b');
        const handle = makeHandler();
        const result = await handle({
            options: { lumpName: 'b' },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(Object.keys(result.data.data!.statusByLump)).toEqual(['b']);
        },
        60_000,
    );

    it('fails for unknown lump name', async () => {
        await writeLump('only');
        const handle = makeHandler();
        const result = await handle({
            options: { lumpName: 'missing' },
            arguments: {},
        });
        expect(result.success).toBe(false);
    }, 60_000);

    it('with silent true (--silent), messages summarize paths instead of dumping JSON',
        async () => {
        await writeLump('alpha');
        const handle = makeHandler();
        const result = await handle({
            options: { silent: true },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages.some((m) => m.includes('Wrote:'))).toBe(true);
        expect(result.data.messages.some((m) => m.trim().startsWith('{'))).toBe(false);
        },
        60_000,
    );

    it('does not call runProjectPreflight', async () => {
        await writeLump('alpha');
        const spy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');
        await makeHandler()({
            options: {},
            arguments: {},
        });
        expect(spy).not.toHaveBeenCalled();
    }, 60_000);

    it('leaves checkout branch unchanged', async () => {
        await writeLump('alpha');
        const before = gitCurrentBranch(projectRoot);
        await makeHandler()({
            options: {},
            arguments: {},
        });
        expect(gitCurrentBranch(projectRoot)).toBe(before);
    }, 60_000);

    it('fails allowlist validation for unlisted discoveryBranch (dedicated)', async () => {
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'local.json'),
            data: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main'],
            },
        });
        const lumpDir = path.join(localConfigFolderPath, 'lumps', 'unlisted');
        await fs.mkdir(lumpDir, { recursive: true });
        await writeJsonFile({
            filePath: path.join(lumpDir, 'config.json'),
            data: {
                discoveryBranch: 'ver/0.0.9',
                contextListJson: { c1: 'README.md' },
                prompt: { promptTemplate: 'task', command: 'claude' },
            },
        });

        const result = await makeHandler()({
            options: {},
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/discoveryBranch|primaryBranches|ver\/0\.0\.9/i);
    }, 60_000);

    it('succeeds in shared mode when discoveryBranch is unlisted (no allowlist)', async () => {
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'local.json'),
            data: {
                mode: 'shared',
                primaryBranch: 'main',
                primaryBranches: ['main'],
            },
        });
        const lumpDir = path.join(localConfigFolderPath, 'lumps', 'unlisted');
        await fs.mkdir(lumpDir, { recursive: true });
        await writeJsonFile({
            filePath: path.join(lumpDir, 'config.json'),
            data: {
                discoveryBranch: 'ver/0.0.9',
                contextListJson: { c1: 'README.md' },
                prompt: { promptTemplate: 'task', command: 'claude' },
            },
        });

        const result = await makeHandler()({
            options: {},
            arguments: {},
        });
        expect(result.success).toBe(true);
    }, 60_000);
});

/**
 * dynamic-discovery-branch F1–F4.
 * Skipped until lump-status wires discoveryBranch resolution (mirrors run C1–C4).
 * Fixture default branch is `main`.
 */
describe('lump-status command — dynamic-discovery-branch (F*)', () => {
    let projectRoot: string;
    let bareDir: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-ddb-'));
        bareDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-ddb-bare-'));
        initBareRemoteAndCheckout(projectRoot, bareDir);
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'project.json'),
            data: { projectName: 'status-ddb-test' },
        });
    }, 60_000);

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(bareDir, { recursive: true, force: true });
    }, 60_000);

    function makeHandler() {
        return command.handlerMaker({ projectRoot, localConfigFolderPath });
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
        execGit('add -A', projectRoot);
        execGit('commit -m "multi lump"', projectRoot);
        execGit('push origin main', projectRoot);
    }

    it('F1: flagless multi-rule lump succeeds with first exact discovery', async () => {
        await setupMultiRuleDedicated();
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');

        const result = await makeHandler()({
            options: { lumpName: 'multi' },
            arguments: {},
        });

        expect(result.success).toBe(true);
        expect(preflightSpy).not.toHaveBeenCalled();
    }, 60_000);

    it('F2: pattern-only lump without flag fails with --discoveryBranch hint', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'patternOnly', { discoveryBranch: 'feature/*' });
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');

        const result = await makeHandler()({
            options: { lumpName: 'patternOnly' },
            arguments: {},
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/--discoveryBranch/);
        expect(preflightSpy).not.toHaveBeenCalled();
    }, 60_000);

    it('F3: discoveryBranch feature/a option succeeds for multi-rule lump', async () => {
        await setupMultiRuleDedicated();
        await createIntegrationBranch({ projectRoot, remoteDir: bareDir, branchName: 'feature/a' });

        const result = await makeHandler()({
            options: { lumpName: 'multi', discoveryBranch: 'feature/a' } as Record<string, unknown>,
            arguments: {},
        });

        expect(result.success).toBe(true);
    }, 60_000);

    it('F4: discoveryBranch feature/* option fails (concrete-only)', async () => {
        await setupMultiRuleDedicated();

        const result = await makeHandler()({
            options: { lumpName: 'multi', discoveryBranch: 'feature/*' } as Record<string, unknown>,
            arguments: {},
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/concrete|pattern|discoveryBranch/i);
    }, 60_000);

    /**
     * clean-local-project-json-config W3 — skipped until status path applies lump defaults.
     */
    describe('lump defaults on status path (clean-local-project-json-config W3)', () => {
        it('W3: applyLumpConfigDefaults called; local verbose inherited when lump omits', async () => {
            await writeJsonFile({
                filePath: path.join(localConfigFolderPath, 'project.json'),
                data: { projectName: 'status-project' },
            });
            await writeJsonFile({
                filePath: path.join(localConfigFolderPath, 'local.json'),
                data: { mode: 'shared', primaryBranch: 'main', verbose: true },
            });
            await writeMinimalLump(projectRoot, 'alpha');
            // Lump without verbose
            const lumpPath = path.join(localConfigFolderPath, 'lumps', 'alpha', 'config.json');
            const lump = JSON.parse(await fs.readFile(lumpPath, 'utf-8')) as Record<string, unknown>;
            delete lump.verbose;
            await writeJsonFile({ filePath: lumpPath, data: lump });

            const applySpy = vi.spyOn(
                await import('../../utils/applyLumpConfigDefaults'),
                'applyLumpConfigDefaults',
            );
            try {
                const result = await makeHandler()({ options: {}, arguments: {} });
                expect(result.success).toBe(true);
                expect(applySpy).toHaveBeenCalled();
                const call = applySpy.mock.calls[0]?.[0];
                expect(call?.resolved.verbose).toBe(true);
            } finally {
                applySpy.mockRestore();
            }
        }, 60_000);
    });
});
