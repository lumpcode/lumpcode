import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { failure, success } from '@lumpcode/core';

import {
    daemonMetaPath,
    makePromiseGate,
    makeStartHandler,
    setupStartTestRepo,
    teardownStartTestRepo,
    writeCommittedLumps,
    writeDedicatedLocal,
    writeDefaultProjectJson,
    type PromiseGate,
} from './testHelpers';

describe('start command — daemon inFlightLumpCount meta (parallel-global-daemon-worktree M*)', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    const projectName = 'stop-mid-run-test-project';

    beforeEach(async () => {
        const project = await setupStartTestRepo({ tmpPrefix: 'lump-start-busy' });
        projectRoot = project.projectRoot;
        remoteDir = project.remoteDir;
        globalConfigFolderPath = project.globalConfigFolderPath;
    });

    afterEach(async () => {
        await teardownStartTestRepo({ projectRoot, remoteDir, globalConfigFolderPath });
    });
    const deps = () => ({ projectRoot, remoteDir, globalConfigFolderPath });

    async function setupForegroundProject(
        localOverrides: Record<string, unknown> = {},
    ) {
        await writeDefaultProjectJson(projectRoot, projectName);
        await writeDedicatedLocal(projectRoot, localOverrides);
        await writeCommittedLumps(projectRoot, ['alpha'], {}, 'add alpha lump');
    }
    function metaPath() {
        return daemonMetaPath(globalConfigFolderPath, projectName);
    }

    async function readRawMeta(): Promise<Record<string, unknown>> {
        return JSON.parse(await fs.readFile(metaPath(), 'utf8')) as Record<string, unknown>;
    }

    async function readMetaCount(): Promise<number | undefined> {
        const metaResult = await import('../../../utils/readDaemonMeta').then((m) =>
            m.readDaemonMeta(metaPath()),
        );
        expect(metaResult.success).toBe(true);
        if (!metaResult.success) throw new Error('unreachable');
        if (metaResult.data.inFlightLumpCount !== undefined) {
            return metaResult.data.inFlightLumpCount;
        }
        const raw = await readRawMeta();
        return typeof raw.inFlightLumpCount === 'number' ? raw.inFlightLumpCount : undefined;
    }

    function assertMetaKeysAreAllowed(raw: Record<string, unknown>) {
        const allowed = new Set([
            'daemonId',
            'cronSetup',
            'workspaceStrategy',
            'lumpName',
            'include',
            'exclude',
            'maxParallelRun',
            'inFlightLumpCount',
        ]);
        for (const key of Object.keys(raw)) {
            expect(allowed.has(key)).toBe(true);
        }
        expect('busy' in raw).toBe(false);
    }

    const runSuccess = success({
        skipped: false as const,
        result: {
            branchName: 'lump/alpha/x',
            contextNames: ['x'],
            contextRunStateList: [],
        },
    });

    it('M1: increments inFlightLumpCount while a lump run is in flight', async () => {
        await setupForegroundProject();
        let resolveRun!: (value: Awaited<ReturnType<typeof import('../../../utils/runLumpFromLumpName').runLumpFromLumpName>>) => void;
        const runDeferred = new Promise<
            Awaited<ReturnType<typeof import('../../../utils/runLumpFromLumpName').runLumpFromLumpName>>
        >((resolve) => {
            resolveRun = resolve;
        });

        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockReturnValue(runDeferred);

        let releaseShutdown!: () => void;
        const shutdownGate = new Promise<void>((resolve) => {
            releaseShutdown = resolve;
        });

        try {
            const startPromise = makeStartHandler(deps(), {
                waitForShutdownOverride: () => shutdownGate,
            })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            await vi.waitFor(async () => {
                const count = await readMetaCount();
                if (count !== 1) {
                    throw new Error(`expected inFlightLumpCount === 1, got ${String(count)}`);
                }
                const raw = await readRawMeta();
                expect('busy' in raw).toBe(false);
            });

            resolveRun(runSuccess);
            releaseShutdown();
            await startPromise;
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('M2: clears inFlightLumpCount after a successful lump run', async () => {
        await setupForegroundProject();
        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockResolvedValue(runSuccess);

        try {
            const result = await makeStartHandler(deps(), {
                // Assert before daemon cleanup removes meta artifacts.
                waitForShutdownOverride: async () => {
                    const count = await readMetaCount();
                    expect(count === 0 || count === undefined).toBe(true);
                    const raw = await readRawMeta();
                    expect(raw.busy).not.toBe(true);
                },
            })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });
            expect(result.success).toBe(true);
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('M3: clears inFlightLumpCount after a lump run error', async () => {
        await setupForegroundProject();
        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockResolvedValue(
                failure({
                    kind: 'message' as const,
                    message: 'boom',
                }),
            );

        try {
            const result = await makeStartHandler(deps(), {
                waitForShutdownOverride: async () => {
                    const count = await readMetaCount();
                    expect(count === 0 || count === undefined).toBe(true);
                    const raw = await readRawMeta();
                    expect(raw.busy).not.toBe(true);
                },
            })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });
            expect(result.success).toBe(true);
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('M3b: clears inFlightLumpCount after a skipped lump', async () => {
        await setupForegroundProject();
        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockResolvedValue(
                success({
                    skipped: true,
                    reason: 'disabled',
                    reasonDetail: 'lump disabled',
                }),
            );

        try {
            const result = await makeStartHandler(deps(), {
                waitForShutdownOverride: async () => {
                    const count = await readMetaCount();
                    expect(count === 0 || count === undefined).toBe(true);
                },
            })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });
            expect(result.success).toBe(true);
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('M4: allowed meta keys include inFlightLumpCount and exclude busy / child pids', async () => {
        await setupForegroundProject();
        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockResolvedValue(runSuccess);

        try {
            await makeStartHandler(deps(), {
                waitForShutdownOverride: async () => {
                    assertMetaKeysAreAllowed(await readRawMeta());
                },
            })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('M5: parallel ref-count peaks at 2 and returns to 0', async () => {
        await setupForegroundProject({
            workspaceStrategy: 'worktree',
            maxParallelRun: 2,
        });
        await writeCommittedLumps(projectRoot, ['beta', 'gamma'], {}, 'add more lumps');

        const gates = new Map<string, PromiseGate>();
        let releaseShutdown!: () => void;
        const shutdownGate = new Promise<void>((resolve) => {
            releaseShutdown = resolve;
        });

        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockImplementation(async (input) => {
                const gate = makePromiseGate();
                gates.set(input.lumpName, gate);
                await gate.promise;
                return runSuccess;
            });

        try {
            const startPromise = makeStartHandler(deps(), {
                waitForShutdownOverride: () => shutdownGate,
            })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            await vi.waitFor(async () => {
                if (gates.size < 2) throw new Error('waiting for two in-flight lumps');
                const count = await readMetaCount();
                if (count !== 2) throw new Error(`expected count 2, got ${String(count)}`);
            });

            for (const gate of gates.values()) {
                gate.resolve();
            }
            await vi.waitFor(() => {
                if (gates.size < 3) throw new Error('waiting for third in-flight lump');
            });
            for (const gate of gates.values()) {
                gate.resolve();
            }
            await vi.waitFor(async () => {
                const count = await readMetaCount();
                if (count !== 0 && count !== undefined) {
                    throw new Error(`expected drained count, got ${String(count)}`);
                }
            });
            releaseShutdown();
            await startPromise;
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('M8: sequential windows show count 1 during each run when maxParallelRun is 1', async () => {
        await setupForegroundProject({ maxParallelRun: 1 });
        await writeCommittedLumps(projectRoot, ['beta'], {}, 'add beta lump');

        const countSnapshots: number[] = [];
        const releaseQueue: Array<() => void> = [];
        let resolveShutdown!: () => void;
        const shutdownGate = new Promise<void>((resolve) => {
            resolveShutdown = resolve;
        });

        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockImplementation(async () => {
                await new Promise<void>((resolve) => {
                    releaseQueue.push(resolve);
                });
                return runSuccess;
            });

        const pollDuringRuns = (async () => {
            for (let index = 0; index < 2; index += 1) {
                await vi.waitFor(() => {
                    if (releaseQueue.length <= index) {
                        throw new Error(`waiting for lump run ${index + 1}`);
                    }
                });
                const count = await readMetaCount();
                countSnapshots.push(count ?? -1);
                releaseQueue[index]?.();
            }
            resolveShutdown();
        })();

        try {
            const startPromise = makeStartHandler(deps(), {
                waitForShutdownOverride: () => shutdownGate,
            })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            await Promise.all([startPromise, pollDuringRuns]);
            expect(countSnapshots).toEqual([1, 1]);
        } finally {
            runLumpSpy.mockRestore();
        }
    });
});
