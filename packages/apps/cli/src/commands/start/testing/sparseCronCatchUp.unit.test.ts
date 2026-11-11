import { failure } from '@lumpcode/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    CATCH_UP_RETRY_DELAY_MS,
    createDaemonTickSchedulerManualClock,
    setDaemonTickSchedulerTestSeam,
} from '../../../utils/daemonTickScheduler';
import {
    runForegroundStart,
    runLumpSuccess,
    setupStartTestRepo,
    teardownStartTestRepo,
    writeCommittedLumps,
    writeDedicatedLocal,
    writeDefaultProjectJson,
} from './testHelpers';

describe('start command — sparse cron catch-up', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    const projectName = 'sparse-cron-catch-up';
    const waitForOpts = { timeout: 20_000, interval: 20 } as const;

    beforeEach(async () => {
        const project = await setupStartTestRepo({
            tmpPrefix: 'lump-start-catch-up',
            projectName,
        });
        projectRoot = project.projectRoot;
        remoteDir = project.remoteDir;
        globalConfigFolderPath = project.globalConfigFolderPath;
        await writeDefaultProjectJson(projectRoot, projectName);
        await writeDedicatedLocal(projectRoot);
        await writeCommittedLumps(projectRoot, ['alpha'], {}, 'add alpha lump');
    });

    afterEach(async () => {
        setDaemonTickSchedulerTestSeam(undefined);
        await teardownStartTestRepo({ projectRoot, remoteDir, globalConfigFolderPath });
        vi.restoreAllMocks();
    });

    const deps = () => ({ projectRoot, remoteDir, globalConfigFolderPath });

    const waitTimedOut = failure({
        kind: 'workspacePathBusy' as const,
        code: 'workspacePathBusy' as const,
        message: 'Workspace path is busy',
        workspacePath: '/tmp/workspace',
        reason: 'waitTimedOut' as const,
    });

    async function runUntilShutdown(work: () => Promise<void>) {
        let failed: unknown;
        const result = await runForegroundStart({
            deps: deps(),
            options: { cronSetup: '0 0 1 6 *' },
            waitForShutdownOverride: async () => {
                try {
                    await work();
                } catch (error) {
                    failed = error;
                }
            },
        });
        if (failed) throw failed;
        return result;
    }

    it('retries a lock wait timeout once the retry delay elapses', async () => {
        const clock = createDaemonTickSchedulerManualClock();
        setDaemonTickSchedulerTestSeam({ now: clock.now, setTimer: clock.setTimer });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        let calls = 0;
        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockImplementation(async () => {
                calls += 1;
                return calls === 1 ? waitTimedOut : runLumpSuccess;
            });

        try {
            const result = await runUntilShutdown(async () => {
                await vi.waitFor(() => {
                    const logged = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
                    if (!logged.includes('workspace lock wait timed out; retry in 60s')) {
                        throw new Error('retry not scheduled');
                    }
                }, waitForOpts);
                clock.advance(CATCH_UP_RETRY_DELAY_MS);
                await vi.waitFor(() => {
                    if (calls !== 2) throw new Error(`expected 2 runs, got ${calls}`);
                    const logged = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
                    if (!logged.includes('catch-up: lock retry')) {
                        throw new Error('lock retry tick not logged');
                    }
                }, waitForOpts);
            });

            expect(result.success).toBe(true);
            expect(calls).toBe(2);
            expect(runLumpSpy.mock.calls[0]?.[0]).toEqual(
                expect.objectContaining({ lumpName: 'alpha' }),
            );
            expect(runLumpSpy.mock.calls[1]?.[0]).toEqual(
                expect.objectContaining({ lumpName: 'alpha' }),
            );
            const errors = errorSpy.mock.calls.map((call) => String(call[0])).join('\n');
            expect(errors).toContain('lump "alpha": Workspace path is busy');
        } finally {
            runLumpSpy.mockRestore();
            logSpy.mockRestore();
            errorSpy.mockRestore();
        }
    }, 30_000);

    it('does not retry a failure that is not a lock wait timeout', async () => {
        const clock = createDaemonTickSchedulerManualClock();
        setDaemonTickSchedulerTestSeam({ now: clock.now, setTimer: clock.setTimer });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockResolvedValue(failure({ kind: 'message', message: 'boom' }));

        try {
            const result = await runUntilShutdown(async () => {
                await vi.waitFor(() => {
                    if (runLumpSpy.mock.calls.length !== 1) {
                        throw new Error(`expected 1 run, got ${runLumpSpy.mock.calls.length}`);
                    }
                }, waitForOpts);
                await vi.waitFor(() => {
                    const logged = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
                    if (!logged.includes('tick 1 — running')) throw new Error('tick not logged');
                }, waitForOpts);
                await new Promise((resolve) => setTimeout(resolve, 200));
                const logged = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
                expect(logged).not.toContain('retry in 60s');
                expect(logged).not.toContain('catch-up: lock retry');
                expect(clock.pendingCount()).toBe(0);
                clock.advance(CATCH_UP_RETRY_DELAY_MS);
                await new Promise((resolve) => setTimeout(resolve, 50));
                expect(runLumpSpy).toHaveBeenCalledTimes(1);
            });
            expect(result.success).toBe(true);
        } finally {
            runLumpSpy.mockRestore();
            logSpy.mockRestore();
        }
    }, 30_000);

    it('runs a missed-fire catch-up when the fire lands during the first tick', async () => {
        const clock = createDaemonTickSchedulerManualClock();
        let onProtected: (() => void) | undefined;
        setDaemonTickSchedulerTestSeam({
            now: clock.now,
            setTimer: clock.setTimer,
            createCron: (input) => {
                onProtected = input.onProtected;
                return {
                    nextRun: () => new Date(clock.now() + 86_400_000),
                    stop: () => undefined,
                    pause: () => undefined,
                    resume: () => undefined,
                };
            },
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        let calls = 0;
        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockImplementation(async () => {
                calls += 1;
                if (calls === 1) onProtected?.();
                return runLumpSuccess;
            });

        try {
            const result = await runUntilShutdown(async () => {
                await vi.waitFor(() => {
                    if (calls !== 2) throw new Error(`expected 2 runs, got ${calls}`);
                    const logged = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
                    if (!logged.includes('catch-up: missed fire')) {
                        throw new Error('missed fire tick not logged');
                    }
                    if (!logged.includes('skipped while a tick is running; catch-up queued')) {
                        throw new Error('skipped fire not logged');
                    }
                }, waitForOpts);
            });
            expect(result.success).toBe(true);
            expect(calls).toBe(2);
            const logged = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
            expect(logged).not.toContain('catch-up: lock retry');
        } finally {
            runLumpSpy.mockRestore();
            logSpy.mockRestore();
        }
    }, 30_000);
});
