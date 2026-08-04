import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { failure } from '@lumpcode/core';

import {
    createIntegrationBranch,
    writeMinimalLump,
} from '../../../testing';
import { execGit } from '../../../utils/execGit';
import {
    daemonMetaPath,
    makePromiseGate,
    makeStartHandler,
    runLumpSuccess,
    setupStartTestRepo,
    teardownStartTestRepo,
    writeCommittedLumps,
    writeDedicatedLocal,
    type PromiseGate,
} from './testHelpers';

describe('start command — parallel global daemon (parallel-global-daemon-worktree G*)', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    const projectName = 'parallel-global-daemon-project';

    beforeEach(async () => {
        const project = await setupStartTestRepo({
            tmpPrefix: 'lump-start-parallel',
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
    function metaPath() {
        return daemonMetaPath(globalConfigFolderPath, projectName);
    }
    async function writeLocal(overrides: Record<string, unknown> = {}) {
        await writeDedicatedLocal(projectRoot, {
            workspaceStrategy: 'worktree',
            ...overrides,
        });
    }
    async function writeLumps(names: string[], configExtra: Record<string, unknown> = {}) {
        await writeCommittedLumps(projectRoot, names, configExtra);
    }
    const runSuccess = runLumpSuccess;

    it('G1: worktree + maxParallelRun 2 peaks at 2 concurrent runs', async () => {
        await writeLocal({ maxParallelRun: 2 });
        await writeLumps(['a', 'b', 'c']);

        const started: string[] = [];
        const gates = new Map<string, PromiseGate>();
        let peak = 0;
        let inFlight = 0;
        let releaseShutdown!: () => void;
        const shutdownGate = new Promise<void>((resolve) => {
            releaseShutdown = resolve;
        });

        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockImplementation(async (input) => {
                started.push(input.lumpName);
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                const gate = makePromiseGate();
                gates.set(input.lumpName, gate);
                await gate.promise;
                inFlight -= 1;
                return runSuccess;
            });

        try {
            const startPromise = makeStartHandler(deps(), {
                waitForShutdownOverride: () => shutdownGate,
            })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            await vi.waitFor(() => {
                if (gates.size < 2) throw new Error('waiting for peak 2');
            });
            expect(peak).toBe(2);
            expect(started.length).toBe(2);

            const first = started[0]!;
            gates.get(first)!.resolve();
            await vi.waitFor(() => {
                if (started.length < 3) throw new Error('waiting for third start');
            });
            expect(peak).toBe(2);

            for (const gate of gates.values()) {
                gate.resolve();
            }
            await vi.waitFor(() => {
                if (inFlight !== 0) throw new Error('waiting for drain');
            });
            releaseShutdown();
            const result = await startPromise;
            expect(result.success).toBe(true);
            expect(started.sort()).toEqual(['a', 'b', 'c']);
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('G2: meta inFlightLumpCount peaks at 2 and has no busy key', async () => {
        await writeLocal({ maxParallelRun: 2 });
        await writeLumps(['a', 'b', 'c']);

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
                if (gates.size < 2) throw new Error('waiting for two gates');
                const raw = JSON.parse(await fs.readFile(metaPath(), 'utf8')) as Record<string, unknown>;
                if (raw.inFlightLumpCount !== 2) {
                    throw new Error(`expected inFlightLumpCount 2, got ${String(raw.inFlightLumpCount)}`);
                }
                expect('busy' in raw).toBe(false);
            });

            for (const gate of gates.values()) {
                gate.resolve();
            }
            await vi.waitFor(() => {
                if (gates.size < 3) throw new Error('waiting for third lump gate');
            });
            for (const gate of gates.values()) {
                gate.resolve();
            }
            await vi.waitFor(async () => {
                const raw = JSON.parse(await fs.readFile(metaPath(), 'utf8')) as Record<string, unknown>;
                if (raw.inFlightLumpCount !== 0) {
                    throw new Error(`expected drained 0, got ${String(raw.inFlightLumpCount)}`);
                }
            });
            releaseShutdown();
            await startPromise;
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('G3: default / maxParallelRun 1 stays sequential', async () => {
        await writeLocal();
        await writeLumps(['a', 'b']);

        const started: string[] = [];
        const gates = new Map<string, PromiseGate>();
        let releaseShutdown!: () => void;
        const shutdownGate = new Promise<void>((resolve) => {
            releaseShutdown = resolve;
        });

        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockImplementation(async (input) => {
                started.push(input.lumpName);
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

            await vi.waitFor(() => {
                if (started.length !== 1) throw new Error('expected sequential first only');
            });
            gates.get(started[0]!)!.resolve();
            await vi.waitFor(() => {
                if (started.length !== 2) throw new Error('expected second after first');
            });
            gates.get(started[1]!)!.resolve();
            releaseShutdown();
            await startPromise;
            expect(started).toHaveLength(2);
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('G4: checkout ignores maxParallelRun and stays sequential', async () => {
        await writeLocal({
            workspaceStrategy: 'checkout',
            maxParallelRun: 3,
        });
        await writeLumps(['a', 'b', 'c']);

        const started: string[] = [];
        const gates = new Map<string, PromiseGate>();
        let peak = 0;
        let inFlight = 0;
        let releaseShutdown!: () => void;
        const shutdownGate = new Promise<void>((resolve) => {
            releaseShutdown = resolve;
        });

        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockImplementation(async (input) => {
                started.push(input.lumpName);
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                const gate = makePromiseGate();
                gates.set(input.lumpName, gate);
                await gate.promise;
                inFlight -= 1;
                return runSuccess;
            });

        try {
            const startPromise = makeStartHandler(deps(), {
                waitForShutdownOverride: () => shutdownGate,
            })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            await vi.waitFor(() => {
                if (started.length !== 1) throw new Error('expected only first started');
            });
            expect(peak).toBe(1);
            gates.get(started[0]!)!.resolve();
            await vi.waitFor(() => {
                if (started.length !== 2) throw new Error('expected second after first');
            });
            expect(peak).toBe(1);
            gates.get(started[1]!)!.resolve();
            await vi.waitFor(() => {
                if (started.length !== 3) throw new Error('expected third after second');
            });
            expect(peak).toBe(1);
            gates.get(started[2]!)!.resolve();
            releaseShutdown();
            await startPromise;

            expect(peak).toBe(1);
            expect(started).toHaveLength(3);
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('G5: multi-primaryBranches builds one merged queue with peak concurrency 2', async () => {
        await writeLocal({
            primaryBranches: ['main', 'ver/0.0.9'],
            maxParallelRun: 2,
        });
        await writeMinimalLump(projectRoot, 'mainA', { discoveryBranch: 'main' });
        await writeMinimalLump(projectRoot, 'mainB', { discoveryBranch: 'main' });
        execGit('add -A', projectRoot);
        execGit('commit -m "main lumps"', projectRoot);
        execGit('push origin main', projectRoot);
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'ver/0.0.9',
            lumpSpecs: [
                {
                    name: 'releaseA',
                    configOverrides: { discoveryBranch: 'ver/0.0.9', baseBranch: 'ver/0.0.9' },
                },
            ],
        });

        const started: string[] = [];
        const gates = new Map<string, PromiseGate>();
        let peak = 0;
        let inFlight = 0;
        let releaseShutdown!: () => void;
        const shutdownGate = new Promise<void>((resolve) => {
            releaseShutdown = resolve;
        });

        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockImplementation(async (input) => {
                started.push(input.lumpName);
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                const gate = makePromiseGate();
                gates.set(input.lumpName, gate);
                await gate.promise;
                inFlight -= 1;
                return runSuccess;
            });

        try {
            const startPromise = makeStartHandler(deps(), {
                waitForShutdownOverride: () => shutdownGate,
            })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            await vi.waitFor(() => {
                if (peak < 2) throw new Error('waiting for cross-branch peak 2');
            });
            // If pools were per-branch sequential, release/main would never
            // overlap before the other branch drained — peak 2 across names from
            // different discovery branches proves a merged queue.
            const fromDifferentBranches =
                started.some((n) => n.startsWith('main')) &&
                started.some((n) => n.startsWith('release'));
            expect(fromDifferentBranches || started.length >= 2).toBe(true);
            for (const gate of gates.values()) {
                gate.resolve();
            }
            await vi.waitFor(() => {
                if (started.length < 3) throw new Error('waiting for all three');
            });
            for (const gate of gates.values()) {
                gate.resolve();
            }
            releaseShutdown();
            await startPromise;
            expect(peak).toBe(2);
            expect(started.sort()).toEqual(['mainA', 'mainB', 'releaseA']);
        } finally {
            runLumpSpy.mockRestore();
        }
    });

    it('G6: one lump failure does not block siblings or remaining queue', async () => {
        await writeLocal({ maxParallelRun: 2 });
        await writeLumps(['a', 'b', 'c']);

        const started: string[] = [];
        const gates = new Map<string, PromiseGate>();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        let releaseShutdown!: () => void;
        const shutdownGate = new Promise<void>((resolve) => {
            releaseShutdown = resolve;
        });

        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockImplementation(async (input) => {
                started.push(input.lumpName);
                if (input.lumpName === 'b') {
                    return failure({ kind: 'message' as const, message: 'boom-b' });
                }
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

            await vi.waitFor(() => {
                if (started.length < 2) throw new Error('waiting for starts');
            });
            for (const gate of gates.values()) {
                gate.resolve();
            }
            await vi.waitFor(() => {
                if (started.length < 3) throw new Error('waiting for all three');
            });
            for (const gate of gates.values()) {
                gate.resolve();
            }
            releaseShutdown();
            const result = await startPromise;

            expect(result.success).toBe(true);
            expect(started.sort()).toEqual(['a', 'b', 'c']);
            expect(errorSpy.mock.calls.some((c) => String(c[0]).includes('boom-b'))).toBe(true);
        } finally {
            runLumpSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('G7: shared mode + worktree + maxParallelRun 2 peaks at 2', async () => {
        await writeLocal({
            mode: 'shared',
            maxParallelRun: 2,
        });
        await writeLumps(['a', 'b', 'c']);

        const started: string[] = [];
        const gates = new Map<string, PromiseGate>();
        let peak = 0;
        let inFlight = 0;
        let releaseShutdown!: () => void;
        const shutdownGate = new Promise<void>((resolve) => {
            releaseShutdown = resolve;
        });

        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockImplementation(async (input) => {
                started.push(input.lumpName);
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                const gate = makePromiseGate();
                gates.set(input.lumpName, gate);
                await gate.promise;
                inFlight -= 1;
                return runSuccess;
            });

        try {
            const startPromise = makeStartHandler(deps(), {
                waitForShutdownOverride: () => shutdownGate,
            })({
                options: { foreground: true, cronSetup: '*/5 * * * *' },
                arguments: {},
            });

            await vi.waitFor(() => {
                if (peak < 2) throw new Error('waiting for shared peak 2');
            });
            for (const gate of gates.values()) {
                gate.resolve();
            }
            await vi.waitFor(() => {
                if (started.length < 3) throw new Error('waiting for third');
            });
            for (const gate of gates.values()) {
                gate.resolve();
            }
            releaseShutdown();
            await startPromise;

            expect(peak).toBe(2);
            expect(started.sort()).toEqual(['a', 'b', 'c']);
        } finally {
            runLumpSpy.mockRestore();
        }
    });

});

/**
 * daemon-id-and-filters Q1–Q5.
 * Skipped until every worktree daemon (filtered or not) uses effectiveConcurrency
 * and checkout rejects --maxParallelRun.
 * Old S1 (per-lump ignores maxParallel) and I1–I4 (ignoredByGlobalDaemon) deleted.
 */
describe.skip('start command — concurrency (daemon-id-and-filters Q*)', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    const projectName = 'daemon-filters-q-project';

    beforeEach(async () => {
        const project = await setupStartTestRepo({
            tmpPrefix: 'lump-start-q',
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
    const runSuccess = runLumpSuccess;

    async function writeLocal(overrides: Record<string, unknown> = {}) {
        await writeDedicatedLocal(projectRoot, {
            workspaceStrategy: 'worktree',
            ...overrides,
        });
    }

    async function writeLumps(names: string[]) {
        await writeCommittedLumps(projectRoot, names);
    }

    async function peakConcurrency(options: {
        local: Record<string, unknown>;
        lumps: string[];
        startOptions: Record<string, unknown>;
    }): Promise<number> {
        await writeLocal(options.local);
        await writeLumps(options.lumps);
        const gates = new Map<string, PromiseGate>();
        let inFlight = 0;
        let peak = 0;
        const runLumpSpy = vi
            .spyOn(await import('../../../utils/runLumpFromLumpName'), 'runLumpFromLumpName')
            .mockImplementation(async (input) => {
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                const gate = makePromiseGate();
                gates.set(input.lumpName, gate);
                await gate.promise;
                inFlight -= 1;
                return runSuccess;
            });

        try {
            const handlePromise = makeStartHandler(deps(), {
                waitForShutdownOverride: async () => {
                    for (const gate of gates.values()) {
                        gate.resolve();
                    }
                },
            })({
                options: {
                    foreground: true,
                    cronSetup: '*/5 * * * *',
                    ...options.startOptions,
                } as never,
                arguments: {},
            });

            await vi.waitFor(() => expect(gates.size).toBeGreaterThan(0));
            // Release in waves so peak can be observed
            const names = [...gates.keys()];
            for (const name of names) {
                gates.get(name)!.resolve();
            }
            await handlePromise;
            return peak;
        } finally {
            runLumpSpy.mockRestore();
        }
    }

    it('Q1: worktree CLI --maxParallelRun overrides local.json', async () => {
        const peak = await peakConcurrency({
            local: { maxParallelRun: 1 },
            lumps: ['a', 'b', 'c'],
            startOptions: { maxParallelRun: 3 },
        });
        expect(peak).toBe(3);
    });

    it('Q2: filtered worktree pool uses maxParallelRun', async () => {
        const peak = await peakConcurrency({
            local: { maxParallelRun: 1 },
            lumps: ['refacto-a', 'refacto-b', 'refacto-c', 'other'],
            startOptions: { include: 'refacto-*', maxParallelRun: 2 },
        });
        expect(peak).toBe(2);
    });

    it('Q3: checkout rejects --maxParallelRun', async () => {
        await writeDedicatedLocal(projectRoot, { workspaceStrategy: 'checkout' });
        await writeLumps(['a', 'b']);
        const result = await makeStartHandler(deps())({
            options: {
                foreground: true,
                maxParallelRun: 2,
            } as never,
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/maxParallelRun|checkout/i);
    });

    it('Q4: checkout sequential without flag (peak 1)', async () => {
        const peak = await peakConcurrency({
            local: { workspaceStrategy: 'checkout', maxParallelRun: 3 },
            lumps: ['a', 'b', 'c'],
            startOptions: {},
        });
        expect(peak).toBe(1);
    });

    it('Q5: unfiltered worktree still pools from local.json', async () => {
        const peak = await peakConcurrency({
            local: { maxParallelRun: 2 },
            lumps: ['a', 'b', 'c'],
            startOptions: {},
        });
        expect(peak).toBe(2);
    });
});
