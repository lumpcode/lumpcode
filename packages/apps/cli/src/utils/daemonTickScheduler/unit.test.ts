import type { Logger } from '@lumpcode/core';
import { describe, expect, it, vi } from 'vitest';

import { noopLogger } from '../noopLogger';
import type { LumpLine } from '../lumpLine';
import {
    CATCH_UP_RETRY_DELAY_MS,
    createDaemonTickScheduler,
    createDaemonTickSchedulerManualClock,
    type TickTrigger,
} from './main';

const START_MS = 1_700_000_000_000;
const FAR_MS = 86_400_000;
const line: LumpLine = { lumpName: 'triage', effectiveDiscoveryBranch: 'main' };

type TickCall = { trigger: TickTrigger; onlyLines?: LumpLine[] };

async function setupScheduler(input: {
    nextDelayMs?: number;
    runTick: (tick: TickCall) => Promise<{ owedLines: LumpLine[] }>;
    shouldStop?: () => Promise<boolean>;
}) {
    const clock = createDaemonTickSchedulerManualClock(START_MS);
    const infos: string[] = [];
    const nextTicks: Array<string | undefined> = [];
    let nextDelayMs = input.nextDelayMs ?? FAR_MS;
    let inTick = false;
    const hooks: {
        onFire?: () => Promise<void>;
        onProtected?: () => void;
    } = {};
    const cronState = { resumed: false, stopped: false };
    const logger: Logger = {
        ...noopLogger,
        info: (message) => {
            infos.push(message);
        },
    };

    const result = await createDaemonTickScheduler({
        cronSetup: '0 0 1 6 *',
        name: 'lumpcode-test',
        logger,
        now: clock.now,
        setTimer: clock.setTimer,
        createCron: (cronInput) => {
            hooks.onFire = cronInput.onFire;
            hooks.onProtected = cronInput.onProtected;
            return {
                nextRun: () => new Date(clock.now() + nextDelayMs),
                stop: () => {
                    cronState.stopped = true;
                },
                pause: () => undefined,
                resume: () => {
                    cronState.resumed = true;
                },
            };
        },
        shouldStop: input.shouldStop ?? (async () => false),
        onNextTickAtChange: async (iso) => {
            nextTicks.push(iso);
        },
        runTick: async (tick) => {
            expect(inTick).toBe(false);
            inTick = true;
            try {
                return await input.runTick(tick);
            } finally {
                inTick = false;
            }
        },
    });

    return {
        clock,
        infos,
        nextTicks,
        hooks,
        cronState,
        result,
        setNextDelayMs: (ms: number) => {
            nextDelayMs = ms;
        },
    };
}

function skipLines(infos: string[]): string[] {
    return infos.filter((lineText) => lineText.includes('skipped while a tick is running'));
}

describe('createDaemonTickScheduler', () => {
    it('fails with the existing message when cronSetup does not parse', async () => {
        let ran = false;
        const result = await createDaemonTickScheduler({
            cronSetup: '%%%',
            name: 'lumpcode-test',
            logger: noopLogger,
            runTick: async () => {
                ran = true;
                return { owedLines: [] };
            },
            shouldStop: async () => false,
            onNextTickAtChange: async () => undefined,
        });

        expect(ran).toBe(false);
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toBe(
            `Failed to start scheduler for "%%%": CronPattern: invalid configuration format ('%%%'), exactly five or six space separated parts are required.`,
        );
    });

    it('runs one missedFire after a scheduled tick, and three fires coalesce', async () => {
        const calls: TickCall[] = [];
        let release = () => {};
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const harness = await setupScheduler({
            runTick: async (tick) => {
                calls.push(tick);
                if (tick.trigger === 'scheduled') {
                    harness.hooks.onProtected?.();
                    await harness.hooks.onFire?.();
                    await harness.hooks.onFire?.();
                    await gate;
                }
                return { owedLines: [] };
            },
        });
        if (!harness.result.success) throw new Error(harness.result.data);

        await harness.result.data.start();
        expect(calls.map((call) => call.trigger)).toEqual(['initial']);

        const scheduled = harness.hooks.onFire?.();
        await vi.waitFor(() => expect(calls.map((call) => call.trigger)).toEqual(['initial', 'scheduled']));
        release();
        await scheduled;

        expect(calls.map((call) => call.trigger)).toEqual(['initial', 'scheduled', 'missedFire']);
        expect(calls[2]?.onlyLines).toBeUndefined();
        expect(skipLines(harness.infos)).toHaveLength(3);
        expect(skipLines(harness.infos)[0]).toMatch(
            /^scheduled fire at .+ skipped while a tick is running; catch-up queued$/,
        );
    });

    it('runs one missedFire when a fire arrives during the initial tick', async () => {
        const calls: TickCall[] = [];
        let release = () => {};
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const harness = await setupScheduler({
            runTick: async (tick) => {
                calls.push(tick);
                if (tick.trigger === 'initial') {
                    await gate;
                }
                return { owedLines: [] };
            },
        });
        if (!harness.result.success) throw new Error(harness.result.data);

        const started = harness.result.data.start();
        await vi.waitFor(() => expect(calls).toHaveLength(1));
        await harness.hooks.onFire?.();
        release();
        await started;

        expect(calls.map((call) => call.trigger)).toEqual(['initial', 'missedFire']);
        expect(harness.cronState.resumed).toBe(true);
        expect(skipLines(harness.infos)).toHaveLength(1);
    });

    it('retries owed lines after the delay, repeats while owed, then stops', async () => {
        const calls: TickCall[] = [];
        let lockRetries = 0;
        const harness = await setupScheduler({
            runTick: async (tick) => {
                calls.push(tick);
                if (tick.trigger === 'lockRetry') {
                    lockRetries += 1;
                    expect(tick.onlyLines).toEqual([line]);
                    return { owedLines: lockRetries === 1 ? [line, { ...line }] : [] };
                }
                return { owedLines: [line, { ...line }] };
            },
        });
        if (!harness.result.success) throw new Error(harness.result.data);

        await harness.result.data.start();
        expect(calls.map((call) => call.trigger)).toEqual(['initial']);
        expect(harness.infos).toContain(
            'lump "triage": workspace lock wait timed out; retry in 60s',
        );
        expect(harness.clock.pendingCount()).toBe(1);

        harness.clock.advance(CATCH_UP_RETRY_DELAY_MS);
        await vi.waitFor(() => expect(calls.map((call) => call.trigger)).toEqual(['initial', 'lockRetry']));
        await vi.waitFor(() =>
            expect(harness.infos.filter((message) => message.includes('retry in 60s'))).toHaveLength(2),
        );

        harness.clock.advance(CATCH_UP_RETRY_DELAY_MS);
        await vi.waitFor(() => expect(calls).toHaveLength(3));
        expect(calls[2]?.trigger).toBe('lockRetry');
        expect(calls[2]?.onlyLines).toEqual([line]);
        await new Promise((resolve) => setTimeout(resolve, 20));
        harness.clock.advance(CATCH_UP_RETRY_DELAY_MS);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(calls).toHaveLength(3);
        expect(harness.clock.pendingCount()).toBe(0);
    });

    it('drops owed lines when the next fire is within the retry delay', async () => {
        const calls: TickCall[] = [];
        const harness = await setupScheduler({
            nextDelayMs: CATCH_UP_RETRY_DELAY_MS,
            runTick: async (tick) => {
                calls.push(tick);
                return { owedLines: [line] };
            },
        });
        if (!harness.result.success) throw new Error(harness.result.data);

        await harness.result.data.start();
        const nextIso = new Date(START_MS + CATCH_UP_RETRY_DELAY_MS).toISOString();
        expect(harness.infos).toContain(
            `lump "triage": workspace lock wait timed out; next scheduled fire at ${nextIso} is within 60s, not retrying`,
        );
        expect(harness.clock.pendingCount()).toBe(0);
        harness.clock.advance(CATCH_UP_RETRY_DELAY_MS * 2);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(calls.map((call) => call.trigger)).toEqual(['initial']);
    });

    it('runs one missedFire full tick and does not lock-retry when both are pending', async () => {
        const calls: TickCall[] = [];
        const harness = await setupScheduler({
            runTick: async (tick) => {
                calls.push(tick);
                if (tick.trigger === 'initial') {
                    harness.hooks.onProtected?.();
                    return { owedLines: [line] };
                }
                return { owedLines: [] };
            },
        });
        if (!harness.result.success) throw new Error(harness.result.data);

        await harness.result.data.start();
        expect(calls.map((call) => call.trigger)).toEqual(['initial', 'missedFire']);
        expect(calls[1]?.onlyLines).toBeUndefined();
        expect(harness.infos.some((message) => message.includes('retry in 60s'))).toBe(false);
        expect(harness.infos.some((message) => message.includes('not retrying'))).toBe(false);
        expect(harness.clock.pendingCount()).toBe(0);
    });

    it('skips catch-up when shouldStop is true and stop() clears a pending retry', async () => {
        const stoppedCalls: TickCall[] = [];
        let stop = false;
        const stopping = await setupScheduler({
            runTick: async (tick) => {
                stoppedCalls.push(tick);
                stop = true;
                stopping.hooks.onProtected?.();
                return { owedLines: [line] };
            },
            shouldStop: async () => stop,
        });
        if (!stopping.result.success) throw new Error(stopping.result.data);
        await stopping.result.data.start();
        stopping.clock.advance(CATCH_UP_RETRY_DELAY_MS * 2);
        expect(stoppedCalls.map((call) => call.trigger)).toEqual(['initial']);
        expect(stopping.clock.pendingCount()).toBe(0);

        const calls: TickCall[] = [];
        const harness = await setupScheduler({
            runTick: async (tick) => {
                calls.push(tick);
                return { owedLines: [line] };
            },
        });
        if (!harness.result.success) throw new Error(harness.result.data);
        await harness.result.data.start();
        expect(harness.clock.pendingCount()).toBe(1);
        harness.result.data.stop();
        expect(harness.cronState.stopped).toBe(true);
        expect(harness.clock.pendingCount()).toBe(0);
        harness.clock.advance(CATCH_UP_RETRY_DELAY_MS);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(calls.map((call) => call.trigger)).toEqual(['initial']);
    });

    it('reports nextTickAt as the pending retry when that is earlier than the cron', async () => {
        const harness = await setupScheduler({
            runTick: async () => ({ owedLines: [line] }),
        });
        if (!harness.result.success) throw new Error(harness.result.data);

        const cronNext = new Date(START_MS + FAR_MS).toISOString();
        const retryAt = new Date(START_MS + CATCH_UP_RETRY_DELAY_MS).toISOString();
        expect(harness.nextTicks[0]).toBe(cronNext);
        await harness.result.data.start();
        expect(harness.nextTicks.at(-1)).toBe(retryAt);
        expect(new Date(retryAt).getTime()).toBeLessThan(new Date(cronNext).getTime());
    });

    it('leaves nextTickAt on the cron run when a missed fire starts immediately', async () => {
        const harness = await setupScheduler({
            runTick: async (tick) => {
                if (tick.trigger === 'initial') {
                    harness.hooks.onProtected?.();
                }
                return { owedLines: tick.trigger === 'initial' ? [line] : [] };
            },
        });
        if (!harness.result.success) throw new Error(harness.result.data);

        const cronNext = new Date(START_MS + FAR_MS).toISOString();
        await harness.result.data.start();
        expect(harness.nextTicks.every((iso) => iso === cronNext)).toBe(true);
        expect(harness.nextTicks).toHaveLength(2);
    });
});
