import { describe, expect, it } from 'vitest';
import { failure, success } from '@lumpcode/core';

import { runLumpLinesWithConcurrency } from './main';

type Gate = { resolve: () => void; promise: Promise<void> };

function makeGate(): Gate {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { resolve, promise };
}

describe('runLumpLinesWithConcurrency (parallel-global-daemon-worktree)', () => {
    const items = (...lumpNames: string[]) => lumpNames.map((lumpName) => ({ lumpName }));
    const line = (lumpName: string, effectiveDiscoveryBranch?: string) =>
        effectiveDiscoveryBranch === undefined
            ? { lumpName }
            : { lumpName, effectiveDiscoveryBranch };

    it('P1: caps concurrency and drains the queue', async () => {
        const gates = new Map<string, Gate>();
        let inFlight = 0;
        let peak = 0;
        const started: string[] = [];

        const poolPromise = runLumpLinesWithConcurrency({
            items: items('a', 'b', 'c', 'd'),
            concurrency: 2,
            runLumpLine: async ({ lumpName }) => {
                started.push(lumpName);
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                const gate = makeGate();
                gates.set(lumpName, gate);
                await gate.promise;
                inFlight -= 1;
            },
        });

        await viWaitFor(() => gates.size >= 2);
        expect(inFlight).toBe(2);
        expect(peak).toBe(2);
        expect(started.slice(0, 2)).toEqual(['a', 'b']);

        gates.get('a')!.resolve();
        await viWaitFor(() => started.length === 3);
        expect(peak).toBe(2);
        expect(started[2]).toBe('c');

        gates.get('b')!.resolve();
        gates.get('c')!.resolve();
        await viWaitFor(() => started.length === 4);
        gates.get('d')!.resolve();

        await poolPromise;
        expect(started).toEqual(['a', 'b', 'c', 'd']);
        expect(peak).toBe(2);
        expect(inFlight).toBe(0);
    });

    it('P2: concurrency greater than length starts all before any finish', async () => {
        const gates = new Map<string, Gate>();
        let peak = 0;
        let inFlight = 0;

        const poolPromise = runLumpLinesWithConcurrency({
            items: items('a', 'b', 'c'),
            concurrency: 5,
            runLumpLine: async ({ lumpName }) => {
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                const gate = makeGate();
                gates.set(lumpName, gate);
                await gate.promise;
                inFlight -= 1;
            },
        });

        await viWaitFor(() => gates.size === 3);
        expect(peak).toBe(3);

        for (const gate of gates.values()) {
            gate.resolve();
        }
        await poolPromise;
    });

    it('P3: concurrency 1 is strictly sequential', async () => {
        const started: string[] = [];
        const gates = new Map<string, Gate>();

        const poolPromise = runLumpLinesWithConcurrency({
            items: items('a', 'b', 'c'),
            concurrency: 1,
            runLumpLine: async ({ lumpName }) => {
                started.push(lumpName);
                const gate = makeGate();
                gates.set(lumpName, gate);
                await gate.promise;
            },
        });

        await viWaitFor(() => started.length === 1);
        expect(started).toEqual(['a']);
        expect(gates.size).toBe(1);

        gates.get('a')!.resolve();
        await viWaitFor(() => started.length === 2);
        expect(started).toEqual(['a', 'b']);

        gates.get('b')!.resolve();
        await viWaitFor(() => started.length === 3);
        gates.get('c')!.resolve();
        await poolPromise;
        expect(started).toEqual(['a', 'b', 'c']);
    });

    it('P4: one failure does not cancel siblings or remaining queue', async () => {
        const started: string[] = [];
        const gates = new Map<string, Gate>();

        const poolPromise = runLumpLinesWithConcurrency({
            items: items('a', 'b', 'c'),
            concurrency: 2,
            runLumpLine: async ({ lumpName }) => {
                started.push(lumpName);
                if (lumpName === 'b') {
                    throw new Error('boom');
                }
                const gate = makeGate();
                gates.set(lumpName, gate);
                await gate.promise;
                return success({ skipped: false });
            },
        });

        await viWaitFor(() => started.includes('a') && started.includes('b'));
        gates.get('a')!.resolve();
        await viWaitFor(() => started.includes('c'));
        gates.get('c')!.resolve();

        await expect(poolPromise).resolves.toBeUndefined();
        expect(started.sort()).toEqual(['a', 'b', 'c']);
    });

    it('P4b: Failure-like return still runs remaining lumps', async () => {
        const started: string[] = [];
        const gates = new Map<string, Gate>();

        const poolPromise = runLumpLinesWithConcurrency({
            items: items('a', 'b', 'c'),
            concurrency: 2,
            runLumpLine: async ({ lumpName }) => {
                started.push(lumpName);
                if (lumpName === 'b') {
                    return failure({ kind: 'message' as const, message: 'boom' });
                }
                const gate = makeGate();
                gates.set(lumpName, gate);
                await gate.promise;
                return success({ skipped: false });
            },
        });

        await viWaitFor(() => started.includes('a') && started.includes('b'));
        gates.get('a')!.resolve();
        await viWaitFor(() => started.includes('c'));
        gates.get('c')!.resolve();

        await expect(poolPromise).resolves.toBeUndefined();
        expect(started.sort()).toEqual(['a', 'b', 'c']);
    });

    it('P5: empty list resolves immediately without calling runLumpLine', async () => {
        let calls = 0;
        await runLumpLinesWithConcurrency({
            items: items(),
            concurrency: 3,
            runLumpLine: async () => {
                calls += 1;
            },
        });
        expect(calls).toBe(0);
    });

    it('P6: preserves queue head order for start attempts', async () => {
        const started: string[] = [];
        const gates = new Map<string, Gate>();

        const poolPromise = runLumpLinesWithConcurrency({
            items: items('a', 'b', 'c'),
            concurrency: 2,
            runLumpLine: async ({ lumpName }) => {
                started.push(lumpName);
                const gate = makeGate();
                gates.set(lumpName, gate);
                await gate.promise;
            },
        });

        await viWaitFor(() => started.length >= 2);
        expect(started.slice(0, 2)).toEqual(['a', 'b']);

        gates.get('a')!.resolve();
        await viWaitFor(() => started.length === 3);
        expect(started[2]).toBe('c');

        gates.get('b')!.resolve();
        gates.get('c')!.resolve();
        await poolPromise;
    });

    it.skip('K1: duplicate same branch serializes so peak in-flight for that key is 1', async () => {
        const gates: Gate[] = [];
        let inFlight = 0;
        let peak = 0;
        const started: number[] = [];
        let call = 0;

        const poolPromise = runLumpLinesWithConcurrency({
            items: [line('B', 'dev'), line('B', 'dev')],
            concurrency: 2,
            runLumpLine: async () => {
                const index = call;
                call += 1;
                started.push(index);
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                const gate = makeGate();
                gates[index] = gate;
                await gate.promise;
                inFlight -= 1;
            },
        });

        await viWaitFor(() => started.length === 1);
        expect(inFlight).toBe(1);
        expect(peak).toBe(1);
        expect(started).toEqual([0]);

        gates[0]!.resolve();
        await viWaitFor(() => started.length === 2);
        expect(started).toEqual([0, 1]);

        gates[1]!.resolve();
        await poolPromise;
        expect(peak).toBe(1);
        expect(inFlight).toBe(0);
    });

    it.skip('K2: different discovery lines may overlap', async () => {
        const gates: Gate[] = [];
        let inFlight = 0;
        let peak = 0;
        const started: string[] = [];
        let call = 0;

        const poolPromise = runLumpLinesWithConcurrency({
            items: [line('B', 'dev'), line('A', 'feature')],
            concurrency: 2,
            runLumpLine: async ({ lumpName, effectiveDiscoveryBranch }) => {
                const index = call;
                call += 1;
                started.push(`${lumpName}@${effectiveDiscoveryBranch}`);
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                const gate = makeGate();
                gates[index] = gate;
                await gate.promise;
                inFlight -= 1;
            },
        });

        await viWaitFor(() => started.length === 2);
        expect(peak).toBe(2);
        expect(started).toEqual(['B@dev', 'A@feature']);

        gates[0]!.resolve();
        gates[1]!.resolve();
        await poolPromise;
    });

    it.skip('K3: same lumpName on different branches may overlap', async () => {
        const gates: Gate[] = [];
        let inFlight = 0;
        let peak = 0;
        const started: string[] = [];
        let call = 0;

        const poolPromise = runLumpLinesWithConcurrency({
            items: [line('B', 'dev'), line('B', 'feature')],
            concurrency: 2,
            runLumpLine: async ({ lumpName, effectiveDiscoveryBranch }) => {
                const index = call;
                call += 1;
                started.push(`${lumpName}@${effectiveDiscoveryBranch}`);
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                const gate = makeGate();
                gates[index] = gate;
                await gate.promise;
                inFlight -= 1;
            },
        });

        await viWaitFor(() => started.length === 2);
        expect(peak).toBe(2);
        expect(started).toEqual(['B@dev', 'B@feature']);

        gates[0]!.resolve();
        gates[1]!.resolve();
        await poolPromise;
    });

    it.skip('K4: omitted branch keys as empty string and serializes like K1', async () => {
        const gates: Gate[] = [];
        let inFlight = 0;
        let peak = 0;
        const started: number[] = [];
        let call = 0;

        const poolPromise = runLumpLinesWithConcurrency({
            items: [line('B'), line('B')],
            concurrency: 2,
            runLumpLine: async () => {
                const index = call;
                call += 1;
                started.push(index);
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                const gate = makeGate();
                gates[index] = gate;
                await gate.promise;
                inFlight -= 1;
            },
        });

        await viWaitFor(() => started.length === 1);
        expect(inFlight).toBe(1);
        expect(peak).toBe(1);
        expect(started).toEqual([0]);

        gates[0]!.resolve();
        await viWaitFor(() => started.length === 2);
        expect(started).toEqual([0, 1]);

        gates[1]!.resolve();
        await poolPromise;
        expect(peak).toBe(1);
        expect(inFlight).toBe(0);
    });

    it.skip('K5: failure of the first same-key row still starts the sibling after it settles', async () => {
        const started: number[] = [];
        let call = 0;
        let firstSettled = false;
        let secondStartedAfterFirstSettled = false;

        const poolPromise = runLumpLinesWithConcurrency({
            items: [line('B', 'dev'), line('B', 'dev')],
            concurrency: 2,
            runLumpLine: async () => {
                const index = call;
                call += 1;
                started.push(index);
                if (index === 0) {
                    try {
                        throw new Error('boom');
                    } finally {
                        firstSettled = true;
                    }
                }
                secondStartedAfterFirstSettled = firstSettled;
            },
        });

        await expect(poolPromise).resolves.toBeUndefined();
        expect(started).toEqual([0, 1]);
        expect(secondStartedAfterFirstSettled).toBe(true);
    });
});

/** Local wait helper so this file does not depend on vitest fake timers. */
async function viWaitFor(assertFn: () => void | boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
        try {
            const result = assertFn();
            if (result === false) {
                throw new Error('condition false');
            }
            return;
        } catch (e) {
            lastError = e;
            await new Promise((r) => setTimeout(r, 10));
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
