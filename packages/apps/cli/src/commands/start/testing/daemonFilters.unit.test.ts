import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeLocalJson, writeMinimalLump } from '../../../testing';
import { aliveDaemonSpawnFn } from '../../../testing';
import { execGit } from '../../../utils/execGit';
import {
    daemonMetaPath,
    localConfigFolderPath,
    makeStartHandler,
    runDetachedStart,
    runLumpSuccess,
    setupStartTestRepo,
    stopDaemon,
    teardownStartTestRepo,
    writeCommittedLumps,
    writeDedicatedLocal,
} from './testHelpers';

/**
 * daemon-id-and-filters F*, O*, S* (filter/overlap/start flags).
 * Skipped until include/exclude/daemonId land on start.
 */
describe('start command — daemon filters (daemon-id-and-filters F*/O*/S*)', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    const projectName = 'daemon-filters-project';

    beforeEach(async () => {
        const project = await setupStartTestRepo({
            tmpPrefix: 'lump-start-filters',
            projectName,
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

    async function writeWorktreeLocal(overrides: Record<string, unknown> = {}) {
        await writeDedicatedLocal(projectRoot, {
            workspaceStrategy: 'worktree',
            ...overrides,
        });
    }

    async function startedNames(startOptions: Record<string, unknown>): Promise<string[]> {
        const started: string[] = [];
        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockImplementation(async (input) => {
                started.push(input.lumpName);
                return runLumpSuccess;
            });
        try {
            const result = await makeStartHandler(deps(), {
                waitForShutdownOverride: async () => {},
            })({
                options: {
                    foreground: true,
                    cronSetup: '*/5 * * * *',
                    ...startOptions,
                } as never,
                arguments: {},
            });
            expect(result.success).toBe(true);
            return started;
        } finally {
            runLumpSpy.mockRestore();
        }
    }

    it('F1: exact include schedules only that lump', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['alpha', 'beta']);
        expect(await startedNames({ include: 'alpha' })).toEqual(['alpha']);
    });

    it('F2: glob include + exclude', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, [
            'refacto-a',
            'refacto-b',
            'refacto-wip',
            'other',
        ]);
        const started = await startedNames({
            include: 'refacto-*',
            exclude: 'refacto-wip',
        });
        expect(started.sort()).toEqual(['refacto-a', 'refacto-b']);
    });

    it('F3: comma-separated include', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['alpha', 'beta', 'gamma']);
        const started = await startedNames({ include: 'alpha,beta' });
        expect(started.sort()).toEqual(['alpha', 'beta']);
    });

    it('F4: empty match warns once, stays up, spy never called', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['alpha']);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockResolvedValue(runLumpSuccess);

        try {
            const result = await makeStartHandler(deps(), {
                waitForShutdownOverride: async () => {
                    const pidPath = path.join(
                        globalConfigFolderPath,
                        'daemons',
                        `${projectName}.global.daemon.pid`,
                    );
                    // Auto id for include=missing may be d-xxxxxx or similar; assert any pid written.
                    const daemonsDir = path.join(globalConfigFolderPath, 'daemons');
                    const entries = await fs.readdir(daemonsDir);
                    expect(entries.some((e) => e.endsWith('.daemon.pid'))).toBe(true);
                    void pidPath;
                },
            })({
                options: {
                    include: 'missing',
                    foreground: true,
                    cronSetup: '*/5 * * * *',
                } as never,
                arguments: {},
            });
            expect(result.success).toBe(true);
            expect(runLumpSpy).not.toHaveBeenCalled();
            const logged = [...warnSpy.mock.calls, ...logSpy.mock.calls]
                .map((c) => String(c[0]))
                .join('\n');
            expect(logged).toMatch(/no lump|match|empty|include/i);
        } finally {
            runLumpSpy.mockRestore();
            warnSpy.mockRestore();
            logSpy.mockRestore();
        }
    });

    it('F5: exact include need not exist at start', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['alpha']);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const result = await makeStartHandler(deps(), {
                waitForShutdownOverride: async () => {},
            })({
                options: {
                    include: 'notYet',
                    foreground: true,
                    cronSetup: '*/5 * * * *',
                } as never,
                arguments: {},
            });
            expect(result.success).toBe(true);
            const logged = [...warnSpy.mock.calls, ...logSpy.mock.calls]
                .map((c) => String(c[0]))
                .join('\n');
            expect(logged).toMatch(/no lump|match|empty|include/i);
        } finally {
            warnSpy.mockRestore();
            logSpy.mockRestore();
        }
    });

    it('F6: exclude-only', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['alpha', 'beta']);
        expect(await startedNames({ exclude: 'beta' })).toEqual(['alpha']);
    });

    it('F7: shared mode filter', async () => {
        await writeLocalJson(localConfigFolderPath(projectRoot), {
            mode: 'shared',
            primaryBranch: 'main',
            workspaceStrategy: 'worktree',
        });
        await writeCommittedLumps(projectRoot, ['alpha', 'beta']);
        expect(await startedNames({ include: 'alpha' })).toEqual(['alpha']);
    });

    it('F8: leftover ignoredByGlobalDaemon key does not filter', async () => {
        await writeWorktreeLocal();
        await writeMinimalLump(projectRoot, 'alpha');
        await writeMinimalLump(projectRoot, 'sideA', { ignoredByGlobalDaemon: true });
        execGit('add -A', projectRoot);
        execGit('commit -m "leftover key"', projectRoot);
        execGit('push origin main', projectRoot);

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const started = await startedNames({});
            expect(started.sort()).toEqual(['alpha', 'sideA']);
            const logged = [...warnSpy.mock.calls, ...logSpy.mock.calls]
                .map((c) => String(c[0]))
                .join('\n');
            expect(logged).not.toMatch(/ignoredByGlobalDaemon|ignoring lump/i);
        } finally {
            warnSpy.mockRestore();
            logSpy.mockRestore();
        }
    });

    it('O1: two overlapping starts succeed with distinct ids', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['backlog']);

        await runDetachedStart(deps(), {
            spawnFn: aliveDaemonSpawnFn,
            include: ['backlog'],
            daemonId: 'a',
        } as never);

        const spawnFn = vi.fn(() => ({
            pid: 555555,
            unref: vi.fn(),
        })) as unknown as typeof import('node:child_process').spawn;

        try {
            const result = await makeStartHandler(deps(), { spawnFn })({
                options: {
                    include: 'backlog',
                    daemonId: 'b',
                } as never,
                arguments: {},
            });
            expect(result.success).toBe(true);
            const daemonsDir = path.join(globalConfigFolderPath, 'daemons');
            const entries = await fs.readdir(daemonsDir);
            expect(entries.some((e) => e.includes('.a.daemon.pid'))).toBe(true);
        } finally {
            await stopDaemon(deps(), { daemonId: 'a' } as never);
            await stopDaemon(deps(), { daemonId: 'b' } as never);
        }
    });

    it('O2: both overlapping daemons schedule the same lump', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['backlog']);
        const startedBy: string[] = [];

        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockImplementation(async () => {
                startedBy.push('backlog');
                return runLumpSuccess;
            });

        try {
            const r1 = await makeStartHandler(deps(), {
                waitForShutdownOverride: async () => {},
            })({
                options: {
                    include: 'backlog',
                    daemonId: 'a',
                    foreground: true,
                    cronSetup: '*/5 * * * *',
                } as never,
                arguments: {},
            });
            const r2 = await makeStartHandler(deps(), {
                waitForShutdownOverride: async () => {},
            })({
                options: {
                    include: 'backlog',
                    daemonId: 'b',
                    foreground: true,
                    cronSetup: '*/5 * * * *',
                } as never,
                arguments: {},
            });
            expect(r1.success).toBe(true);
            expect(r2.success).toBe(true);
            expect(startedBy.filter((n) => n === 'backlog').length).toBeGreaterThanOrEqual(2);
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('S1: unfiltered → daemonId global + new paths', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['alpha']);
        const result = await makeStartHandler(deps(), {
            waitForShutdownOverride: async () => {
                const pidPath = path.join(
                    globalConfigFolderPath,
                    'daemons',
                    `${projectName}.global.daemon.pid`,
                );
                await expect(fs.access(pidPath)).resolves.toBeUndefined();
                const meta = JSON.parse(
                    await fs.readFile(
                        daemonMetaPath(globalConfigFolderPath, projectName, 'global'),
                        'utf8',
                    ),
                ) as { daemonId?: string; lumpName?: string };
                expect(meta.daemonId).toBe('global');
                expect(meta.lumpName).toBeUndefined();
            },
        })({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        const messages = result.data.messages.join('\n');
        expect(messages).toMatch(/daemonId|global/i);
        expect(messages).toMatch(/--daemonId=global|stop.*global/i);
    });

    it('S2: explicit --daemonId unfiltered', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['alpha']);
        const result = await makeStartHandler(deps(), {
            waitForShutdownOverride: async () => {
                const meta = JSON.parse(
                    await fs.readFile(
                        daemonMetaPath(globalConfigFolderPath, projectName, 'agents'),
                        'utf8',
                    ),
                ) as { daemonId?: string };
                expect(meta.daemonId).toBe('agents');
            },
        })({
            options: {
                daemonId: 'agents',
                foreground: true,
                cronSetup: '*/5 * * * *',
            } as never,
            arguments: {},
        });
        expect(result.success).toBe(true);
    });

    it('S3: deprecated --lumpName → include + warn', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['backlog']);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const result = await makeStartHandler(deps(), {
                waitForShutdownOverride: async () => {
                    const meta = JSON.parse(
                        await fs.readFile(
                            daemonMetaPath(globalConfigFolderPath, projectName, 'backlog'),
                            'utf8',
                        ),
                    ) as { include?: string[]; lumpName?: string; daemonId?: string };
                    expect(meta.include).toEqual(['backlog']);
                    expect(meta.lumpName).toBeUndefined();
                    expect(meta.daemonId).toBe('backlog');
                },
            })({
                options: {
                    lumpName: 'backlog',
                    foreground: true,
                    cronSetup: '*/5 * * * *',
                },
                arguments: {},
            });
            expect(result.success).toBe(true);
            const logged = [...warnSpy.mock.calls, ...logSpy.mock.calls]
                .map((c) => String(c[0]))
                .join('\n');
            expect(logged).toMatch(/deprecated|lumpName/i);
        } finally {
            warnSpy.mockRestore();
            logSpy.mockRestore();
        }
    });

    it('S4: --lumpName + --include fails', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['alpha']);
        const result = await makeStartHandler(deps())({
            options: {
                lumpName: 'alpha',
                include: 'alpha',
                foreground: true,
            } as never,
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/lumpName|include/i);
    });

    it('S5 / X3: start has no discoveryBranch option', async () => {
        // Option removed from Commander/Zod — passing it must not be a supported start flag.
        const schema = (await import('../main')).command.inputSchema;
        const shape = schema.shape.options.shape as Record<string, unknown>;
        expect(shape.discoveryBranch).toBeUndefined();
    });

    it('S6: detached child argv forwards new flags', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['alpha']);
        const spawnFn = vi.fn((_cmd: string, args?: readonly string[]) => {
            const argList = args as readonly string[];
            expect(argList).toContain('--include');
            expect(argList).toContain('--exclude');
            expect(argList).toContain('--daemonId');
            expect(argList).toContain('--maxParallelRun');
            return { pid: 424242, unref: vi.fn() } as unknown as ReturnType<
                typeof import('node:child_process').spawn
            >;
        }) as unknown as typeof import('node:child_process').spawn;

        const result = await makeStartHandler(deps(), { spawnFn })({
            options: {
                include: 'alpha',
                exclude: 'beta',
                daemonId: 'agents',
                maxParallelRun: 2,
            } as never,
            arguments: {},
        });
        expect(result.success).toBe(true);
        expect(spawnFn).toHaveBeenCalledOnce();
    });

    it('S7: id in use at start fails daemonIdInUse', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['alpha']);
        await runDetachedStart(deps(), {
            spawnFn: aliveDaemonSpawnFn,
            daemonId: 'agents',
        } as never);
        try {
            const result = await makeStartHandler(deps())({
                options: { daemonId: 'agents' } as never,
                arguments: {},
            });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages.join(' ')).toMatch(/daemonIdInUse|already|in use/i);
        } finally {
            await stopDaemon(deps(), { daemonId: 'agents' } as never);
        }
    });

    it('S8: invalid --daemonId charset fails', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['alpha']);
        const result = await makeStartHandler(deps())({
            options: { daemonId: 'bad id', foreground: true } as never,
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/invalid|daemonId|charset|[a-zA-Z0-9_-]/i);
    });

    it('S9: successful start prints resolved daemonId', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['alpha']);
        const result = await makeStartHandler(deps(), {
            waitForShutdownOverride: async () => {},
        })({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(
            result.data.messages.join('\n') + JSON.stringify(result.data.data ?? {}),
        ).toMatch(/global|daemonId/i);
    });

    it('M4: deprecated --lumpName writes include not lumpName', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['backlog']);
        await makeStartHandler(deps(), {
            waitForShutdownOverride: async () => {
                const meta = JSON.parse(
                    await fs.readFile(
                        daemonMetaPath(globalConfigFolderPath, projectName, 'backlog'),
                        'utf8',
                    ),
                ) as Record<string, unknown>;
                expect(meta.include).toEqual(['backlog']);
                expect(meta.daemonId).toBe('backlog');
                expect('lumpName' in meta).toBe(false);
            },
        })({
            options: { lumpName: 'backlog', foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
    });

    it('M5: unfiltered write has daemonId global and no lumpName', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['alpha']);
        await makeStartHandler(deps(), {
            waitForShutdownOverride: async () => {
                const meta = JSON.parse(
                    await fs.readFile(
                        daemonMetaPath(globalConfigFolderPath, projectName, 'global'),
                        'utf8',
                    ),
                ) as Record<string, unknown>;
                expect(meta.daemonId).toBe('global');
                expect('lumpName' in meta).toBe(false);
            },
        })({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
    });

    it('M6: meta allowlist includes new keys and strips child-pid junk', async () => {
        await writeWorktreeLocal();
        await writeCommittedLumps(projectRoot, ['alpha']);
        await makeStartHandler(deps(), {
            waitForShutdownOverride: async () => {
                const meta = JSON.parse(
                    await fs.readFile(
                        daemonMetaPath(globalConfigFolderPath, projectName, 'global'),
                        'utf8',
                    ),
                ) as Record<string, unknown>;
                for (const key of ['daemonId', 'cronSetup', 'workspaceStrategy']) {
                    expect(key in meta).toBe(true);
                }
                expect('agentPid' in meta).toBe(false);
                expect('childPids' in meta).toBe(false);
            },
        })({
            options: { foreground: true, cronSetup: '*/5 * * * *' },
            arguments: {},
        });
    });
});
