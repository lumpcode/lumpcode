import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { withAliveDaemon, writeMinimalLump } from '../../../testing';
import { createTempTestDirs, removeTempTestDirs } from '../../../utils';
import { writeJsonFile } from '../../../utils/writeJsonFile';
import { command } from '../main';
import {
    localConfigFolderPath,
    makeStartHandler,
    setupStartTestRepo,
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
    const aliveDaemonDeps = () => ({
        projectRoot,
        localConfigFolderPath: localConfigFolderPath(projectRoot),
        globalConfigFolderPath,
    });

    it('fails when not a Lumpcode project root', async () => {
        const dirs = await createTempTestDirs({ prefix: 'lump-start-bad-', remote: false });
        try {
            const handle = command.handlerMaker({
                projectRoot: dirs.projectRoot,
                localConfigFolderPath: dirs.localConfigFolderPath,
                globalConfigFolderPath: dirs.globalConfigFolderPath,
            });
            const result = await handle({ options: {}, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain('Not a Lumpcode project root');
        } finally {
            await removeTempTestDirs(dirs);
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
        await writeDefaultProjectJson(projectRoot, 'invalid-cron-project');
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

    it('writes PID and stub meta when detaching (spawn mocked)', async () => {
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
        expect((await fs.readFile(pidPath, 'utf8')).trim()).toBe('424242');
        const metaPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.meta.json`);
        await expect(fs.access(metaPath)).resolves.toBeUndefined();
        const desiredPath = path.join(
            globalConfigFolderPath,
            'daemons',
            `${projectName}.global.daemon.desired.json`,
        );
        const desired = JSON.parse(await fs.readFile(desiredPath, 'utf8')) as { daemonId: string };
        expect(desired.daemonId).toBe('global');
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

        await withAliveDaemon({
            ...aliveDaemonDeps(),
            lumpName: 'alpha',
            alsoStopDaemonIds: ['global'],
            run: async () => {
                const result = await makeStartHandler(deps(), { spawnFn })({ options: {}, arguments: {} });
                expect(result.success).toBe(true);
                if (!result.success) throw new Error('unreachable');
                expect(spawnFn).toHaveBeenCalledOnce();
            },
        });
    });

    it('fails to start when the same daemonId is already running', async () => {
        await writeDefaultProjectJson(projectRoot, 'conflict-same-id-project');
        await writeDefaultLocalJson(projectRoot);

        await writeMinimalLump(projectRoot, 'alpha');

        await withAliveDaemon({
            ...aliveDaemonDeps(),
            run: async () => {
                const result = await makeStartHandler(deps())({ options: {}, arguments: {} });
                expect(result.success).toBe(false);
                if (result.success) throw new Error('unreachable');
                expect(result.data.messages[0]).toMatch(/already in use|already running/i);
            },
        });
    });

    it('foreground start continues when the pid file already belongs to this process', async () => {
        const projectName = 'self-pid-foreground-project';
        await writeDefaultProjectJson(projectRoot, projectName);
        await writeDefaultLocalJson(projectRoot);
        await writeMinimalLump(projectRoot, 'alpha');

        const pidPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.pid`);
        const metaPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.meta.json`);
        await fs.mkdir(path.dirname(pidPath), { recursive: true });
        await fs.writeFile(pidPath, `${process.pid}\n`, 'utf8');
        await writeJsonFile({
            filePath: metaPath,
            data: {
                daemonId: 'global',
                cronSetup: '*/5 * * * *',
                workspaceStrategy: 'checkout',
            },
            trailingNewline: true,
        });

        const handle = makeStartHandler(deps(), { waitForShutdownOverride: async () => {} });
        const result = await handle({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
    });

    it('allows two filtered daemons under checkout strategy', async () => {
        await writeDefaultProjectJson(projectRoot, 'two-filters-checkout-project');
        await writeDefaultLocalJson(projectRoot, { workspaceStrategy: 'checkout' });

        for (const name of ['alpha', 'beta']) {
            await writeMinimalLump(projectRoot, name);
        }

        const spawnFn = vi.fn(() => ({ pid: 555555, unref: vi.fn() })) as unknown as typeof import('node:child_process').spawn;

        await withAliveDaemon({
            ...aliveDaemonDeps(),
            lumpName: 'alpha',
            alsoStopDaemonIds: ['beta'],
            run: async () => {
                const result = await makeStartHandler(deps(), { spawnFn })({
                    options: { include: 'beta' },
                    arguments: {},
                });
                expect(result.success).toBe(true);
                if (!result.success) throw new Error('unreachable');
                expect(spawnFn).toHaveBeenCalledOnce();
            },
        });
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
    describe('merged project+local freeze (clean-local-project-json-config W4/W5)', () => {
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
            await writeJsonFile({
                filePath: path.join(projectRoot, '.lumpcode', 'project.json'),
                data: { projectName: 'no-primary-project' },
            });
            await writeJsonFile({
                filePath: path.join(projectRoot, '.lumpcode', 'local.json'),
                data: { mode: 'dedicated' },
            });
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
