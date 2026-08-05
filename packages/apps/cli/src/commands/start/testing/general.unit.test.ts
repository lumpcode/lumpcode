import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { writeMinimalLump } from '../../../testing';
import { command } from '../main';
import {
    makeStartHandler,
    runDetachedStart,
    setupStartTestRepo,
    stopDaemon,
    teardownStartTestRepo,
    writeDefaultLocalJson,
    writeDefaultProjectJson,
} from './testHelpers';

describe('start command', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        const project = await setupStartTestRepo({ tmpPrefix: 'lump-start' });
        projectRoot = project.projectRoot;
        remoteDir = project.remoteDir;
        globalConfigFolderPath = project.globalConfigFolderPath;
    });

    afterEach(async () => {
        await teardownStartTestRepo({ projectRoot, remoteDir, globalConfigFolderPath });
    });
    const deps = () => ({ projectRoot, remoteDir, globalConfigFolderPath });

    it('fails when not a Lumpcode project root', async () => {
        const badRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-start-bad-'));
        const badGlobal = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-start-bad-global-'));
        try {
            await fs.mkdir(path.join(badRoot, '.lumpcode'), { recursive: true });
            const handle = command.handlerMaker({
                projectRoot: badRoot,
                localConfigFolderPath: path.join(badRoot, '.lumpcode'),
                globalConfigFolderPath: badGlobal,
            });
            const result = await handle({ options: {}, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain('Not a Lumpcode project root');
        } finally {
            await fs.rm(badRoot, { recursive: true, force: true });
            await fs.rm(badGlobal, { recursive: true, force: true });
        }
    });

    it('starts with no loadable lumps (empty queue / idle ticks allowed)', async () => {
        await writeDefaultProjectJson(projectRoot, 'empty-lumps-project');
        await writeDefaultLocalJson(projectRoot);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const handle = makeStartHandler(deps(), { waitForShutdownOverride: async () => {} });
            const result = await handle({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });
            expect(result.success).toBe(true);
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('fails on an invalid cron expression before running lumps', async () => {
        await writeDefaultLocalJson(projectRoot);
        await writeMinimalLump(projectRoot, 'alpha');

        const handle = makeStartHandler(deps());
        const result = await handle({
            options: { cronSetup: '%%%' },
            arguments: {},
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toMatch(/Invalid cron expression/);
    });

    it('fails before scheduling when .lumpcode/local.json is missing', async () => {
        await writeMinimalLump(projectRoot, 'alpha');
        await writeDefaultProjectJson(projectRoot, 'test-no-local');

        const handle = makeStartHandler(deps(), { waitForShutdownOverride: async () => {} });
        const result = await handle({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('local.json');
    });

    it('skips the tick when local.json has disabled: true', async () => {
        await writeDefaultProjectJson(projectRoot, 'test-project-disabled-local');
        await writeDefaultLocalJson(projectRoot, { disabled: true });

        await writeMinimalLump(projectRoot, 'alpha');

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            const handle = makeStartHandler(deps(), { waitForShutdownOverride: async () => {} });
            const result = await handle({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            if (!result.success) {
                throw new Error(`expected success, got: ${result.data.messages.join(' | ')}`);
            }

            const loggedMessages = logSpy.mock.calls.map((call) => String(call[0]));
            expect(loggedMessages.some((m) => m.includes('project disabled in local.json'))).toBe(true);
            expect(loggedMessages.some((m) => m.includes('tick 1'))).toBe(false);
            expect(errorSpy).not.toHaveBeenCalled();
        } finally {
            logSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('skips a lump when its config has disabled: true in foreground mode', async () => {
        await writeDefaultProjectJson(projectRoot, 'test-disabled-project');
        await writeDefaultLocalJson(projectRoot);
        await writeMinimalLump(projectRoot, 'alpha', { disabled: true });

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            const handle = makeStartHandler(deps(), { waitForShutdownOverride: async () => {} });
            const result = await handle({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            if (!result.success) {
                throw new Error(`expected success, got: ${result.data.messages.join(' | ')}`);
            }

            const loggedMessages = logSpy.mock.calls.map((call) => String(call[0]));
            expect(loggedMessages.some((m) => m.includes('lump "alpha": skipped (disabled)'))).toBe(true);
            expect(errorSpy).not.toHaveBeenCalled();
        } finally {
            logSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('skips a lump when disabled is a sync function returning true', async () => {
        await writeDefaultProjectJson(projectRoot, 'test-disabled-fn-project');
        await writeDefaultLocalJson(projectRoot);

        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'alpha');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(
            path.join(lumpDir, 'config.js'),
            `export default {
                contextListJson: { FILE: "src/{NAME}.ts" },
                prompt: {
                    promptTemplate: "Improve the code at @{FILE}.",
                    command: "claude",
                },
                disabled: () => true,
            };`,
            'utf-8',
        );

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            const handle = makeStartHandler(deps(), { waitForShutdownOverride: async () => {} });
            const result = await handle({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            if (!result.success) {
                throw new Error(`expected success, got: ${result.data.messages.join(' | ')}`);
            }

            const loggedMessages = logSpy.mock.calls.map((call) => String(call[0]));
            expect(loggedMessages.some((m) => m.includes('lump "alpha": skipped (disabled)'))).toBe(true);
            expect(errorSpy).not.toHaveBeenCalled();
        } finally {
            logSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('skips a lump when disabled is an async function resolving true', async () => {
        await writeDefaultProjectJson(projectRoot, 'test-disabled-async-fn-project');
        await writeDefaultLocalJson(projectRoot);

        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'alpha');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(
            path.join(lumpDir, 'config.js'),
            `export default {
                contextListJson: { FILE: "src/{NAME}.ts" },
                prompt: {
                    promptTemplate: "Improve the code at @{FILE}.",
                    command: "claude",
                },
                disabled: async () => true,
            };`,
            'utf-8',
        );

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            const handle = makeStartHandler(deps(), { waitForShutdownOverride: async () => {} });
            const result = await handle({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            if (!result.success) {
                throw new Error(`expected success, got: ${result.data.messages.join(' | ')}`);
            }

            const loggedMessages = logSpy.mock.calls.map((call) => String(call[0]));
            expect(loggedMessages.some((m) => m.includes('lump "alpha": skipped (disabled)'))).toBe(true);
            expect(errorSpy).not.toHaveBeenCalled();
        } finally {
            logSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('skips a lump when disabled is a FilePath to a module exporting the checker', async () => {
        const disabledHookPath = path.join(
            projectRoot,
            '.lumpcode',
            'lumps',
            'alpha',
            'disabledViaImport.js',
        );

        await writeDefaultProjectJson(projectRoot, 'test-disabled-import-project');
        await writeDefaultLocalJson(projectRoot);

        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'alpha');
        await fs.mkdir(lumpDir, { recursive: true });

        await fs.writeFile(
            disabledHookPath,
            `export default () => true;\n`,
            'utf-8',
        );

        await fs.writeFile(
            path.join(lumpDir, 'config.js'),
            `export default {
                contextListJson: { FILE: "src/{NAME}.ts" },
                prompt: {
                    promptTemplate: "Improve the code at @{FILE}.",
                    command: "claude",
                },
                disabled: ${JSON.stringify(disabledHookPath)},
            };`,
            'utf-8',
        );

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            const handle = makeStartHandler(deps(), { waitForShutdownOverride: async () => {} });
            const result = await handle({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            if (!result.success) {
                throw new Error(`expected success, got: ${result.data.messages.join(' | ')}`);
            }

            const loggedMessages = logSpy.mock.calls.map((call) => String(call[0]));
            expect(loggedMessages.some((m) => m.includes('lump "alpha": skipped (disabled)'))).toBe(true);
            expect(errorSpy).not.toHaveBeenCalled();
        } finally {
            logSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('does not write PID or meta when detaching (spawn mocked)', async () => {
        const projectName = 'test-daemon-project';
        await writeDefaultProjectJson(projectRoot, projectName);
        await writeDefaultLocalJson(projectRoot);

        await writeMinimalLump(projectRoot, 'alpha');

        const spawnFn = vi.fn((_command: string, args?: readonly string[] | Record<string, unknown>) => {
            expect(Array.isArray(args)).toBe(true);
            const argList = args as readonly string[];
            expect(argList).toContain('start');
            expect(argList).toContain('--foreground');
            return { pid: 424242, unref: vi.fn() } as unknown as ReturnType<
            typeof import('node:child_process').spawn
            >;
        }) as unknown as typeof import('node:child_process').spawn;

        const handle = makeStartHandler(deps(), { spawnFn });
        const result = await handle({ options: {}, arguments: {} });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(spawnFn).toHaveBeenCalledOnce();

        const pidPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.pid`);
        await expect(fs.access(pidPath)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('writes PID and meta in foreground mode', async () => {
        const projectName = 'test-foreground-daemon-project';
        await writeDefaultProjectJson(projectRoot, projectName);
        await writeDefaultLocalJson(projectRoot);

        await writeMinimalLump(projectRoot, 'alpha');

        const pidPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.pid`);
        const metaPath = path.join(
            globalConfigFolderPath,
            'daemons',
            `${projectName}.global.daemon.meta.json`,
        );

        const handle = makeStartHandler(deps(), {
            waitForShutdownOverride: async () => {
                expect((await fs.readFile(pidPath, 'utf8')).trim()).toBe(String(process.pid));
                const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as {
                    daemonId: string;
                    cronSetup: string;
                    workspaceStrategy: string;
                };
                expect(meta.daemonId).toBe('global');
                expect(meta.cronSetup).toBe('*/5 * * * *');
                expect(meta.workspaceStrategy).toBe('checkout');
            },
        });
        const result = await handle({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
    });

    it('writes filtered daemon PID and meta with include (not lumpName field)', async () => {
        const projectName = 'test-foreground-lump-daemon-project';
        await writeDefaultProjectJson(projectRoot, projectName);
        await writeDefaultLocalJson(projectRoot);

        await writeMinimalLump(projectRoot, 'alpha');

        const pidPath = path.join(
            globalConfigFolderPath,
            'daemons',
            `${projectName}.alpha.daemon.pid`,
        );
        const metaPath = path.join(
            globalConfigFolderPath,
            'daemons',
            `${projectName}.alpha.daemon.meta.json`,
        );

        const handle = makeStartHandler(deps(), {
            waitForShutdownOverride: async () => {
                expect((await fs.readFile(pidPath, 'utf8')).trim()).toBe(String(process.pid));
                const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as {
                    daemonId: string;
                    include?: string[];
                    lumpName?: string;
                };
                expect(meta.daemonId).toBe('alpha');
                expect(meta.include).toEqual(['alpha']);
                expect(meta.lumpName).toBeUndefined();
            },
        });
        const result = await handle({
            options: { foreground: true, include: 'alpha' },
            arguments: {},
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
    });

    it('allows overlapping filtered daemon alongside global', async () => {
        await writeDefaultProjectJson(projectRoot, 'overlap-global-project');
        await writeDefaultLocalJson(projectRoot);

        await writeMinimalLump(projectRoot, 'alpha');

        const spawnFn = vi.fn(() => ({ pid: 444444, unref: vi.fn() })) as unknown as typeof import('node:child_process').spawn;

        try {
            await runDetachedStart(deps(), { lumpName: 'alpha' });

            const result = await makeStartHandler(deps(), { spawnFn })({ options: {}, arguments: {} });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(spawnFn).toHaveBeenCalledOnce();
        } finally {
            await stopDaemon(deps(), { daemonId: 'alpha' });
            await stopDaemon(deps(), { daemonId: 'global' });
        }
    });

    it('fails to start when the same daemonId is already running', async () => {
        await writeDefaultProjectJson(projectRoot, 'conflict-same-id-project');
        await writeDefaultLocalJson(projectRoot);

        await writeMinimalLump(projectRoot, 'alpha');

        try {
            await runDetachedStart(deps(), {});

            const result = await makeStartHandler(deps())({ options: {}, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toMatch(/already in use|already running/i);
        } finally {
            await stopDaemon(deps());
        }
    });

    it('allows two filtered daemons under checkout strategy', async () => {
        await writeDefaultProjectJson(projectRoot, 'two-filters-checkout-project');
        await writeDefaultLocalJson(projectRoot, { workspaceStrategy: 'checkout' });

        for (const name of ['alpha', 'beta']) {
            await writeMinimalLump(projectRoot, name);
        }

        const spawnFn = vi.fn(() => ({ pid: 555555, unref: vi.fn() })) as unknown as typeof import('node:child_process').spawn;

        try {
            await runDetachedStart(deps(), { lumpName: 'alpha' });

            const result = await makeStartHandler(deps(), { spawnFn })({
                options: { include: 'beta' },
                arguments: {},
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(spawnFn).toHaveBeenCalledOnce();
        } finally {
            await stopDaemon(deps(), { daemonId: 'alpha' });
            await stopDaemon(deps(), { daemonId: 'beta' });
        }
    });

    it('rejects --maxParallelRun when workspaceStrategy is checkout', async () => {
        await writeDefaultProjectJson(projectRoot, 'max-parallel-checkout-project');
        await writeDefaultLocalJson(projectRoot, { workspaceStrategy: 'checkout' });
        await writeMinimalLump(projectRoot, 'alpha');

        const result = await makeStartHandler(deps())({
            options: { maxParallelRun: 2, foreground: true },
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toMatch(/worktree/i);
    });

    /**
     * clean-local-project-json-config W4–W5 — skipped until start freezes readProjectLocalConfig.
     */
    describe.skip('merged project+local freeze (clean-local-project-json-config W4/W5)', () => {
        it('W4: readProjectLocalConfig called once at startup; disk mutate after freeze ignored', async () => {
            await writeDefaultProjectJson(projectRoot, 'freeze-merged-project');
            await writeDefaultLocalJson(projectRoot);
            await writeMinimalLump(projectRoot, 'alpha', { disabled: true });

            const readSpy = vi.spyOn(
                await import('../../../utils/readProjectLocalConfig'),
                'readProjectLocalConfig',
            );

            try {
                const handle = makeStartHandler(deps(), { waitForShutdownOverride: async () => {} });
                const result = await handle({
                    options: { foreground: true, cronSetup: '*/5 * * * *' },
                    arguments: {},
                });
                expect(result.success).toBe(true);
                expect(readSpy).toHaveBeenCalledTimes(1);

                // Mutate disk after freeze — next start would re-read; same process tick uses freeze.
                await writeDefaultLocalJson(projectRoot, { disabled: true });
                expect(readSpy).toHaveBeenCalledTimes(1);
            } finally {
                readSpy.mockRestore();
            }
        });

        it('W5: missing merged primary fails start', async () => {
            await fs.writeFile(
                path.join(projectRoot, '.lumpcode', 'project.json'),
                JSON.stringify({ projectName: 'no-primary-project' }),
                'utf-8',
            );
            await fs.writeFile(
                path.join(projectRoot, '.lumpcode', 'local.json'),
                JSON.stringify({ mode: 'dedicated' }),
                'utf-8',
            );
            await writeMinimalLump(projectRoot, 'alpha');

            const result = await makeStartHandler(deps())({
                options: { foreground: true },
                arguments: {},
            });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages.join(' ')).toMatch(/primaryBranch|primaryBranches|project\.json|local\.json/i);
        });
    });
});
