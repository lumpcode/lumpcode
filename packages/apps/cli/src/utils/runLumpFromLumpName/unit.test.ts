import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as core from '@lumpcode/core';

import { noopLogger } from '../noopLogger';

import { LUMP_BRANCH_PREFIX } from '../../consts';
import { writeMinimalLump } from '../../testing';
import { acquireWorkspacePathLock } from '../workspacePathLock';
import { runLumpFromLumpName } from './main';
import { execGit } from '../execGit';

vi.mock('@lumpcode/core', async () => {
    const actual = await vi.importActual<typeof core>('@lumpcode/core');
    return {
        ...actual,
        runLump: vi.fn(),
    };
});


describe('runLumpFromLumpName', () => {
    let projectRoot: string;
    let remoteDir: string;
    let localConfigFolderPath: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-from-name-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-from-name-remote-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-from-name-global-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(localConfigFolderPath, { recursive: true });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'dedicated', primaryBranch: 'main' }),
            'utf-8',
        );
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'run-from-name-test' }),
            'utf-8',
        );

        execGit('init --bare', remoteDir);
        execGit('init -b main', projectRoot);
        execGit('config user.email "test@test.com"', projectRoot);
        execGit('config user.name "Test"', projectRoot);
        execGit('commit --allow-empty -m "init"', projectRoot);
        execGit(`remote add origin ${remoteDir}`, projectRoot);
        execGit('push -u origin main', projectRoot);

        vi.mocked(core.runLump).mockReset();
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    function callRunLumpFromLumpName(overrides: Partial<Parameters<typeof runLumpFromLumpName>[0]> = {}) {
        return runLumpFromLumpName({
            lumpName: 'my-lump',
            localConfigFolderPath,
            globalConfigFolderPath,
            sourceProjectRoot: projectRoot,
            logger: noopLogger,
            ...overrides,
        });
    }

    async function countLockFiles(): Promise<number> {
        const locksDir = path.join(globalConfigFolderPath, 'workspace-path-locks');
        const files = await fs.readdir(locksDir).catch(() => []);
        return files.filter((f) => f.endsWith('.lock.json')).length;
    }

    function createAndPushLumpBranch(lumpName: string, contextName: string) {
        const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        execGit('commit --allow-empty -m "lump work"', projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
        execGit('checkout main', projectRoot);
    }

    it('releases the execution path lock when a dedicated lump is disabled', async () => {
        await writeMinimalLump(projectRoot, 'my-lump', { disabled: true });

        const result = await callRunLumpFromLumpName();

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.skipped).toBe(true);
        if (!result.data.skipped) throw new Error('unreachable');
        expect(result.data.reason).toBe('disabled');
        expect(await countLockFiles()).toBe(0);
        expect(core.runLump).not.toHaveBeenCalled();
    });

    it('releases the execution path lock when tooManyOpenBranches skips in phase 2', async () => {
        await writeMinimalLump(projectRoot, 'my-lump', { maximumNumberOfConcurrentBranches: 2 });
        createAndPushLumpBranch('my-lump', 'ctx-a');
        createAndPushLumpBranch('my-lump', 'ctx-b');

        const result = await callRunLumpFromLumpName();

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.skipped).toBe(true);
        if (!result.data.skipped) throw new Error('unreachable');
        expect(result.data.reason).toBe('tooManyOpenBranches');
        expect(await countLockFiles()).toBe(0);
        expect(core.runLump).not.toHaveBeenCalled();
    });

    it('returns workspacePathBusy without adopting a lock when execution path is held', async () => {
        await writeMinimalLump(projectRoot, 'my-lump');
        const held = await acquireWorkspacePathLock({
            globalConfigFolderPath,
            workspacePath: projectRoot,
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(held.success).toBe(true);
        if (!held.success) throw new Error('unreachable');

        const result = await callRunLumpFromLumpName({ lockMode: 'fail' });

        expect(result.success).toBe(false);
        expect(await countLockFiles()).toBe(1);

        await held.data();
        expect(await countLockFiles()).toBe(0);
        expect(core.runLump).not.toHaveBeenCalled();
    });

    /**
     * Target abort wiring for kill-spawned-command-on-timeout-abort.
     * Skipped until runLumpFromLumpName forwards AbortSignal into core.runLump.
     */
    describe('abort signal wiring (W1)', () => {
        it('W1: runLumpFromLumpName passes signal to runLump', async () => {
            await writeMinimalLump(projectRoot, 'my-lump');
            vi.mocked(core.runLump).mockResolvedValue(
                core.success({
                    result: {
                        branchName: 'lump/my-lump/ctx',
                        contextNames: ['ctx'],
                        contextRunStateList: [],
                    },
                } as unknown as core.RunLumpOutput),
            );

            const result = await callRunLumpFromLumpName();

            expect(result.success).toBe(true);
            expect(core.runLump).toHaveBeenCalled();
            const runInput = vi.mocked(core.runLump).mock.calls[0]?.[0] as {
                signal?: AbortSignal;
            };
            expect(runInput.signal).toBeInstanceOf(AbortSignal);
            expect(runInput.signal?.aborted).toBe(false);
        });
    });

    /**
     * clean-local-project-json-config W1 / C* via phase 1 — skipped until defaults apply before phase 2.
     */
    describe('lump defaults + cap wiring (clean-local-project-json-config W*/C*)', () => {
        it('W1: applies project command when lump omits command', async () => {
            await fs.writeFile(
                path.join(localConfigFolderPath, 'project.json'),
                JSON.stringify({
                    projectName: 'run-from-name-test',
                    command: 'cursor',
                }),
                'utf-8',
            );
            await writeMinimalLump(projectRoot, 'my-lump', { command: undefined });
            // Rewrite lump without top-level command (JSON omit).
            const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'my-lump');
            await fs.writeFile(
                path.join(lumpDir, 'config.json'),
                JSON.stringify({
                    contextListJson: { NAME: 'README' },
                    prompt: { promptTemplate: 'E2E @{NAME}' },
                }),
                'utf-8',
            );

            const applySpy = vi.spyOn(
                await import('../applyLumpConfigDefaults'),
                'applyLumpConfigDefaults',
            );
            const phase2Spy = vi.spyOn(
                await import('../runLumpFromJsConfig'),
                'runLumpFromJsConfig',
            );
            try {
                vi.mocked(core.runLump).mockResolvedValue(
                    core.success({
                        result: {
                            branchName: 'lump/my-lump/ctx',
                            contextNames: ['ctx'],
                            contextRunStateList: [],
                        },
                    } as unknown as core.RunLumpOutput),
                );

                await callRunLumpFromLumpName();

                expect(applySpy).toHaveBeenCalled();
                expect(phase2Spy).toHaveBeenCalled();
                const phase2Arg = phase2Spy.mock.calls[0]?.[0];
                expect(phase2Arg?.jsConfig.command).toBe('cursor');
            } finally {
                applySpy.mockRestore();
                phase2Spy.mockRestore();
            }
        });

        it('C: inherited project cap skips tooManyOpenBranches', async () => {
            await fs.writeFile(
                path.join(localConfigFolderPath, 'project.json'),
                JSON.stringify({
                    projectName: 'run-from-name-test',
                    maximumNumberOfConcurrentBranches: 2,
                }),
                'utf-8',
            );
            await writeMinimalLump(projectRoot, 'my-lump');
            // Ensure lump omits cap
            const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'my-lump');
            const raw = JSON.parse(await fs.readFile(path.join(lumpDir, 'config.json'), 'utf-8')) as Record<
                string,
                unknown
            >;
            delete raw.maximumNumberOfConcurrentBranches;
            await fs.writeFile(path.join(lumpDir, 'config.json'), JSON.stringify(raw), 'utf-8');

            createAndPushLumpBranch('my-lump', 'ctx-a');
            createAndPushLumpBranch('my-lump', 'ctx-b');

            const result = await callRunLumpFromLumpName();
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.skipped).toBe(true);
            if (!result.data.skipped) throw new Error('unreachable');
            expect(result.data.reason).toBe('tooManyOpenBranches');
            expect(core.runLump).not.toHaveBeenCalled();
        });
    });
});
