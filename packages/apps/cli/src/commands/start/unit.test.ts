import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    aliveDaemonSpawnFn,
    createIntegrationBranch,
    setDaemonTestGlobalConfigFolder,
    waitForDaemonPidFile,
    writeLocalJson,
    writeMinimalLump,
} from '../../testing';
import { resolveDaemonPaths } from '../../utils/resolveDaemonPaths';
import * as runProjectPreflightModule from '../../utils/runProjectPreflight';
import { command as stopCommand } from '../stop/main';
import { command } from './main';

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

const minimalLumpConfigJson = `{
  "contextListJson": {
    "FILE": "src/{NAME}.ts"
  },
  "prompt": {
    "promptTemplate": "Improve the code at @{FILE}.",
    "command": "claude"
  }
}`;

async function writeDefaultProjectJson(projectRoot: string, projectName: string) {
    await fs.writeFile(
        path.join(projectRoot, '.lumpcode', 'project.json'),
        JSON.stringify({ projectName }),
        'utf-8',
    );
}

async function writeDefaultLocalJson(
    projectRoot: string,
    overrides: { disabled?: boolean; workspaceStrategy?: 'checkout' | 'worktree' } = {},
) {
    await fs.writeFile(
        path.join(projectRoot, '.lumpcode', 'local.json'),
        JSON.stringify({ mode: 'dedicated', discoveryBranch: 'main', ...overrides }),
        'utf-8',
    );
}

describe('start command', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-start-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-start-remote-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-start-global-'));
        setDaemonTestGlobalConfigFolder(globalConfigFolderPath);
        git('init --bare', remoteDir);
        git('init -b main', projectRoot);
        git('config user.email "test@test.com"', projectRoot);
        git('config user.name "Test"', projectRoot);
        git('commit --allow-empty -m "init"', projectRoot);
        git(`remote add origin ${remoteDir}`, projectRoot);
        git('push -u origin main', projectRoot);
        await fs.mkdir(path.join(projectRoot, '.lumpcode', 'lumps'), { recursive: true });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    const localConfigFolderPath = () => path.join(projectRoot, '.lumpcode');

    function makeStartHandler(overrides: Partial<Parameters<typeof command.handlerMaker>[0]> = {}) {
        return command.handlerMaker({
            projectRoot,
            localConfigFolderPath: localConfigFolderPath(),
            globalConfigFolderPath,
            ...overrides,
        });
    }

    async function runDetachedStart(
        options: { lumpName?: string; cronSetup?: string; spawnFn?: typeof aliveDaemonSpawnFn } = {},
    ) {
        const { lumpName, cronSetup, spawnFn = aliveDaemonSpawnFn } = options;
        const handle = makeStartHandler({ spawnFn });
        const result = await handle({
            options: {
                ...(lumpName !== undefined ? { lumpName } : {}),
                ...(cronSetup !== undefined ? { cronSetup } : {}),
            },
            arguments: {},
        });
        expect(result.success).toBe(true);

        const pathsResult = await resolveDaemonPaths({
            projectRoot,
            localConfigFolderPath: localConfigFolderPath(),
            globalConfigFolderPath,
            lumpName,
        });
        if (!pathsResult.success) {
            throw new Error(pathsResult.data);
        }
        await waitForDaemonPidFile(pathsResult.data.pidFilePath);
    }

    async function stopDaemon(options: { lumpName?: string } = {}) {
        const handle = stopCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath: localConfigFolderPath(),
            globalConfigFolderPath,
        });
        await handle({
            options: options.lumpName !== undefined ? { lumpName: options.lumpName } : {},
            arguments: {},
        });
    }

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

    it('fails when there are no loadable lumps', async () => {
        await writeDefaultLocalJson(projectRoot);
        const handle = makeStartHandler();
        const result = await handle({ options: {}, arguments: {} });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('No lumps with a loadable config');
    });

    it('fails on an invalid cron expression before running lumps', async () => {
        await writeDefaultLocalJson(projectRoot);
        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'alpha');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(path.join(lumpDir, 'config.json'), minimalLumpConfigJson, 'utf-8');

        const handle = makeStartHandler();
        const result = await handle({
            options: { cronSetup: '%%%' },
            arguments: {},
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toMatch(/Invalid cron expression/);
    });

    it('fails before scheduling when .lumpcode/local.json is missing', async () => {
        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'alpha');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(path.join(lumpDir, 'config.json'), minimalLumpConfigJson, 'utf-8');
        await writeDefaultProjectJson(projectRoot, 'test-no-local');

        const handle = makeStartHandler({ waitForShutdownOverride: async () => {} });
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

        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'alpha');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(path.join(lumpDir, 'config.json'), minimalLumpConfigJson, 'utf-8');

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            const handle = makeStartHandler({ waitForShutdownOverride: async () => {} });
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
        const disabledLumpConfigJson = `{
            "contextListJson": {
                "FILE": "src/{NAME}.ts"
            },
            "prompt": {
                "promptTemplate": "Improve the code at @{FILE}.",
                "command": "claude"
            },
            "disabled": true
            }
        `;
        await writeDefaultProjectJson(projectRoot, 'test-disabled-project');
        await writeDefaultLocalJson(projectRoot);

        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'alpha');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(path.join(lumpDir, 'config.json'), disabledLumpConfigJson, 'utf-8');

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            const handle = makeStartHandler({ waitForShutdownOverride: async () => {} });
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
            const handle = makeStartHandler({ waitForShutdownOverride: async () => {} });
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
            const handle = makeStartHandler({ waitForShutdownOverride: async () => {} });
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
            const handle = makeStartHandler({ waitForShutdownOverride: async () => {} });
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

        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'alpha');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(path.join(lumpDir, 'config.json'), minimalLumpConfigJson, 'utf-8');

        const spawnFn = vi.fn((_command: string, args?: readonly string[] | Record<string, unknown>) => {
            expect(Array.isArray(args)).toBe(true);
            const argList = args as readonly string[];
            expect(argList).toContain('start');
            expect(argList).toContain('--foreground');
            return { pid: 424242, unref: vi.fn() } as unknown as ReturnType<
            typeof import('node:child_process').spawn
            >;
        }) as unknown as typeof import('node:child_process').spawn;

        const handle = makeStartHandler({ spawnFn });
        const result = await handle({ options: {}, arguments: {} });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(spawnFn).toHaveBeenCalledOnce();

        const pidPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.pid`);
        await expect(fs.access(pidPath)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('writes PID and meta in foreground mode', async () => {
        const projectName = 'test-foreground-daemon-project';
        await writeDefaultProjectJson(projectRoot, projectName);
        await writeDefaultLocalJson(projectRoot);

        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'alpha');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(path.join(lumpDir, 'config.json'), minimalLumpConfigJson, 'utf-8');

        const pidPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.pid`);
        const metaPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.meta.json`);

        const handle = makeStartHandler({
            waitForShutdownOverride: async () => {
                expect((await fs.readFile(pidPath, 'utf8')).trim()).toBe(String(process.pid));
                const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as {
                    cronSetup: string;
                    workspaceStrategy: string;
                };
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

    it('writes per-lump PID and meta in foreground mode with --lumpName', async () => {
        const projectName = 'test-foreground-lump-daemon-project';
        await writeDefaultProjectJson(projectRoot, projectName);
        await writeDefaultLocalJson(projectRoot);

        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'alpha');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(path.join(lumpDir, 'config.json'), minimalLumpConfigJson, 'utf-8');

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

        const handle = makeStartHandler({
            waitForShutdownOverride: async () => {
                expect((await fs.readFile(pidPath, 'utf8')).trim()).toBe(String(process.pid));
                const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as { lumpName: string };
                expect(meta.lumpName).toBe('alpha');
            },
        });
        const result = await handle({
            options: { foreground: true, lumpName: 'alpha' },
            arguments: {},
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
    });

    it('fails to start global daemon when a per-lump daemon is already running', async () => {
        await writeDefaultProjectJson(projectRoot, 'conflict-global-project');
        await writeDefaultLocalJson(projectRoot);

        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'alpha');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(path.join(lumpDir, 'config.json'), minimalLumpConfigJson, 'utf-8');

        try {
            await runDetachedStart({ lumpName: 'alpha' });

            const result = await makeStartHandler()({ options: {}, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain('per-lump daemon already running');
        } finally {
            await stopDaemon({ lumpName: 'alpha' });
        }
    });

    it('fails to start per-lump daemon when global daemon is running', async () => {
        await writeDefaultProjectJson(projectRoot, 'conflict-lump-global-project');
        await writeDefaultLocalJson(projectRoot);

        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'alpha');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(path.join(lumpDir, 'config.json'), minimalLumpConfigJson, 'utf-8');

        try {
            await runDetachedStart({});

            const result = await makeStartHandler()({ options: { lumpName: 'alpha' }, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain('global daemon already running');
        } finally {
            await stopDaemon();
        }
    });

    it('fails to start second per-lump daemon under checkout strategy', async () => {
        await writeDefaultProjectJson(projectRoot, 'conflict-two-lumps-project');
        await writeDefaultLocalJson(projectRoot, { workspaceStrategy: 'checkout' });

        for (const name of ['alpha', 'beta']) {
            const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', name);
            await fs.mkdir(lumpDir, { recursive: true });
            await fs.writeFile(path.join(lumpDir, 'config.json'), minimalLumpConfigJson, 'utf-8');
        }

        try {
            await runDetachedStart({ lumpName: 'alpha' });

            const result = await makeStartHandler()({ options: { lumpName: 'beta' }, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain(
                'Only one daemon can run with workspace strategy "checkout"',
            );
        } finally {
            await stopDaemon({ lumpName: 'alpha' });
        }
    });

    it('allows second per-lump daemon under worktree strategy when another lump runs', async () => {
        await writeDefaultProjectJson(projectRoot, 'worktree-two-lumps-project');
        await writeDefaultLocalJson(projectRoot, { workspaceStrategy: 'worktree' });

        for (const name of ['alpha', 'beta']) {
            const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', name);
            await fs.mkdir(lumpDir, { recursive: true });
            await fs.writeFile(path.join(lumpDir, 'config.json'), minimalLumpConfigJson, 'utf-8');
        }

        const spawnFn = vi.fn(() => ({ pid: 444444, unref: vi.fn() })) as unknown as typeof import('node:child_process').spawn;

        try {
            await runDetachedStart({ lumpName: 'alpha' });

            const result = await makeStartHandler({ spawnFn })({
                options: { lumpName: 'beta' },
                arguments: {},
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(spawnFn).toHaveBeenCalledOnce();
        } finally {
            await stopDaemon({ lumpName: 'alpha' });
            await stopDaemon({ lumpName: 'beta' });
        }
    });

    it('fails to start worktree per-lump daemon when a checkout per-lump daemon is running', async () => {
        await writeDefaultProjectJson(projectRoot, 'checkout-blocks-worktree-project');
        await writeDefaultLocalJson(projectRoot, { workspaceStrategy: 'checkout' });

        for (const name of ['alpha', 'beta']) {
            const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', name);
            await fs.mkdir(lumpDir, { recursive: true });
            await fs.writeFile(path.join(lumpDir, 'config.json'), minimalLumpConfigJson, 'utf-8');
        }

        try {
            await runDetachedStart({ lumpName: 'alpha' });
            await writeDefaultLocalJson(projectRoot, { workspaceStrategy: 'worktree' });

            const result = await makeStartHandler()({ options: { lumpName: 'beta' }, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain('workspace strategy "checkout"');
        } finally {
            await stopDaemon({ lumpName: 'alpha' });
        }
    });
});

describe('start command — multi discovery branches', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-start-mbb-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-start-mbb-remote-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-start-mbb-global-'));
        setDaemonTestGlobalConfigFolder(globalConfigFolderPath);
        git('init --bare', remoteDir);
        git('init -b main', projectRoot);
        git('config user.email "test@test.com"', projectRoot);
        git('config user.name "Test"', projectRoot);
        git('commit --allow-empty -m "init"', projectRoot);
        git(`remote add origin ${remoteDir}`, projectRoot);
        git('push -u origin main', projectRoot);
        await fs.mkdir(path.join(projectRoot, '.lumpcode', 'lumps'), { recursive: true });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
        await writeDefaultProjectJson(projectRoot, 'mbb-daemon-project');
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    const localConfigFolderPath = () => path.join(projectRoot, '.lumpcode');

    function makeStartHandler(overrides: Partial<Parameters<typeof command.handlerMaker>[0]> = {}) {
        return command.handlerMaker({
            projectRoot,
            localConfigFolderPath: localConfigFolderPath(),
            globalConfigFolderPath,
            ...overrides,
        });
    }

    async function writeMultiLocal(overrides: Record<string, unknown> = {}) {
        await writeLocalJson(localConfigFolderPath(), {
            mode: 'dedicated',
            discoveryBranch: 'main',
            discoveryBranches: ['main', 'ver/0.0.9'],
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

        const result = await makeStartHandler({ waitForShutdownOverride: async () => {} })({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
        expect(result.success).toBe(true);
    });

    it('succeeds launch when the same lumpName exists on two discovery branches (sharedName)', async () => {
        await writeMultiLocal();
        await writeMinimalLump(projectRoot, 'sharedName', { discoveryBranch: 'main' });
        git('add -A', projectRoot);
        git('commit -m "same on main"', projectRoot);
        git('push origin main', projectRoot);
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'ver/0.0.9',
            lumpSpecs: [{ name: 'sharedName', configOverrides: { discoveryBranch: 'ver/0.0.9' } }],
        });

        const result = await makeStartHandler({ waitForShutdownOverride: async () => {} })({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
        expect(result.success).toBe(true);
    });

    it('fails launch for unlisted lump discoveryBranch', async () => {
        await writeMultiLocal({ discoveryBranches: ['main'] });
        await writeMinimalLump(projectRoot, 'legacyLine', { discoveryBranch: 'ver/0.0.7' });

        const result = await makeStartHandler()({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/discoveryBranch|discoveryBranches|ver\/0\.0\.7/i);
    });

    it('fails launch when a branch has unloadable lump config', async () => {
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

        const result = await makeStartHandler()({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/config|badLine/i);
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
            const result = await makeStartHandler({ waitForShutdownOverride: async () => {} })({
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
        await writeLocalJson(localConfigFolderPath(), {
            mode: 'dedicated',
            discoveryBranch: 'main',
            discoveryBranches: ['main'],
        });
        await writeMinimalLump(projectRoot, 'releaseLine', {
            discoveryBranch: 'ver/0.0.9',
            baseBranch: 'ver/0.0.9',
        });

        const result = await makeStartHandler()({
            options: { lumpName: 'releaseLine', foreground: true },
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/ver\/0\.0\.9|discoveryBranch|discoveryBranches/i);
    });

    it('succeeds start --lumpName when lump discoveryBranch is listed', async () => {
        await writeMultiLocal();
        await writeMinimalLump(projectRoot, 'releaseLine', {
            discoveryBranch: 'ver/0.0.9',
            baseBranch: 'ver/0.0.9',
        });
        await createIntegrationBranch({ projectRoot, remoteDir, branchName: 'ver/0.0.9' });

        const result = await makeStartHandler({ waitForShutdownOverride: async () => {} })({
            options: { lumpName: 'releaseLine', foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
        expect(result.success).toBe(true);
    });

    it('shared mode launch succeeds without multi-discovery branch loop', async () => {
        await writeLocalJson(localConfigFolderPath(), {
            mode: 'shared',
            discoveryBranch: 'main',
            discoveryBranches: ['main', 'ver/0.0.9'],
        });
        await writeMinimalLump(projectRoot, 'mainLine');
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        try {
            const result = await makeStartHandler({ waitForShutdownOverride: async () => {} })({
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

    it('runs lumps in discovery-branch scan order on each tick', async () => {
        await writeLocalJson(localConfigFolderPath(), {
            mode: 'dedicated',
            discoveryBranch: 'main',
            discoveryBranches: ['ver/0.0.9', 'main'],
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
            await import('../../utils/runLumpFromJsConfig'),
            'runLumpFromJsConfig',
        );
        await makeStartHandler({ waitForShutdownOverride: async () => {} })({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });

        const lumpNames = runLumpSpy.mock.calls.map((c) => c[0].lumpName);
        expect(lumpNames.indexOf('releaseLine')).toBeLessThan(lumpNames.lastIndexOf('mainLine'));
    });
});

