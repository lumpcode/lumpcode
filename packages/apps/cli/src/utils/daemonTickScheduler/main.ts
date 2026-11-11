import { Cron } from 'croner';

import type { Failure, Logger, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { LumpLine } from '../lumpLine';

export const CATCH_UP_RETRY_DELAY_MS = 60_000;

const RETRY_DELAY_SECONDS = CATCH_UP_RETRY_DELAY_MS / 1000;

export type TickTrigger = 'initial' | 'scheduled' | 'missedFire' | 'lockRetry';

export type DaemonTickSchedulerCron = {
    nextRun: () => Date | null;
    stop: () => void;
    pause: () => void;
    resume: () => void;
};

export type DaemonTickSchedulerTimer = {
    clear: () => void;
};

export type CreateDaemonTickSchedulerCron = (input: {
    cronSetup: string;
    name: string;
    onFire: () => Promise<void>;
    onProtected: () => void;
}) => DaemonTickSchedulerCron;

/** Test-only clock and cron. Production callers leave this unset. */
export type DaemonTickSchedulerTestSeam = {
    now?: () => number;
    setTimer?: (callback: () => void, delayMs: number) => DaemonTickSchedulerTimer;
    createCron?: CreateDaemonTickSchedulerCron;
};

export type DaemonTickSchedulerManualClock = {
    now: () => number;
    setTimer: (callback: () => void, delayMs: number) => DaemonTickSchedulerTimer;
    advance: (ms: number) => void;
    pendingCount: () => number;
};

export type DaemonTickSchedulerHandle = {
    start: () => Promise<void>;
    stop: () => void;
};

export type CreateDaemonTickSchedulerInput = {
    cronSetup: string;
    name: string;
    logger: Logger;
    runTick: (input: {
        trigger: TickTrigger;
        onlyLines?: LumpLine[];
    }) => Promise<{ owedLines: LumpLine[] }>;
    shouldStop: () => Promise<boolean>;
    onNextTickAtChange: (iso: string | undefined) => Promise<void>;
    /** Test-only. Overrides the module seam for this scheduler. */
    now?: () => number;
    setTimer?: (callback: () => void, delayMs: number) => DaemonTickSchedulerTimer;
    createCron?: CreateDaemonTickSchedulerCron;
};

let installedTestSeam: DaemonTickSchedulerTestSeam | undefined;

export function setDaemonTickSchedulerTestSeam(seam: DaemonTickSchedulerTestSeam | undefined): void {
    installedTestSeam = seam;
}

export function createDaemonTickSchedulerManualClock(
    startMs = Date.now(),
): DaemonTickSchedulerManualClock {
    let current = startMs;
    let seq = 0;
    const timers: Array<{
        at: number;
        seq: number;
        callback: () => void;
        cleared: boolean;
    }> = [];

    return {
        now: () => current,
        setTimer(callback, delayMs) {
            const entry = {
                at: current + delayMs,
                seq: seq++,
                callback,
                cleared: false,
            };
            timers.push(entry);
            return {
                clear: () => {
                    entry.cleared = true;
                },
            };
        },
        advance(ms) {
            const target = current + ms;
            while (true) {
                let nextIndex = -1;
                for (let index = 0; index < timers.length; index++) {
                    const timer = timers[index]!;
                    if (timer.cleared || timer.at > target) continue;
                    if (nextIndex === -1) {
                        nextIndex = index;
                        continue;
                    }
                    const best = timers[nextIndex]!;
                    if (timer.at < best.at || (timer.at === best.at && timer.seq < best.seq)) {
                        nextIndex = index;
                    }
                }
                if (nextIndex === -1) break;
                const due = timers[nextIndex]!;
                due.cleared = true;
                current = due.at;
                due.callback();
            }
            current = target;
        },
        pendingCount: () => timers.filter((timer) => !timer.cleared).length,
    };
}

function defaultSetTimer(callback: () => void, delayMs: number): DaemonTickSchedulerTimer {
    const handle = setTimeout(callback, delayMs);
    return {
        clear: () => {
            clearTimeout(handle);
        },
    };
}

function defaultCreateCron(input: {
    cronSetup: string;
    name: string;
    onFire: () => Promise<void>;
    onProtected: () => void;
}): DaemonTickSchedulerCron {
    const job = new Cron(
        input.cronSetup,
        {
            paused: true,
            name: input.name,
            protect: () => {
                input.onProtected();
            },
        },
        async () => {
            await input.onFire();
        },
    );
    return {
        nextRun: () => job.nextRun(),
        stop: () => {
            job.stop();
        },
        pause: () => {
            job.pause();
        },
        resume: () => {
            job.resume();
        },
    };
}

function failedToStartScheduler(cronSetup: string, error: unknown): string {
    const msg = error instanceof Error ? error.message : String(error);
    return `Failed to start scheduler for "${cronSetup}": ${msg}`;
}

function lumpLineKey(line: LumpLine): string {
    return `${line.lumpName}\0${line.effectiveDiscoveryBranch ?? ''}`;
}

function dedupeLines(lines: LumpLine[]): LumpLine[] {
    const seen = new Set<string>();
    const result: LumpLine[] = [];
    for (const line of lines) {
        const key = lumpLineKey(line);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ ...line });
    }
    return result;
}

export async function createDaemonTickScheduler(
    input: CreateDaemonTickSchedulerInput,
): Promise<Success<DaemonTickSchedulerHandle> | Failure<string>> {
    const seam = installedTestSeam;
    const now = input.now ?? seam?.now ?? (() => Date.now());
    const setTimer = input.setTimer ?? seam?.setTimer ?? defaultSetTimer;
    const createCron = input.createCron ?? seam?.createCron ?? defaultCreateCron;
    const { logger } = input;

    const cronRef: { cron?: DaemonTickSchedulerCron } = {};
    let busy = false;
    let armed = false;
    let stopped = false;
    let didStart = false;
    let missed = false;
    let retryToken = 0;
    let pendingRetryAt: number | undefined;
    let retryTimer: DaemonTickSchedulerTimer | undefined;
    let idleTimer: DaemonTickSchedulerTimer | undefined;

    function activeCron(): DaemonTickSchedulerCron {
        const cron = cronRef.cron;
        if (!cron) {
            throw new Error('daemon tick scheduler cron is not ready');
        }
        return cron;
    }

    function clearIdle(): void {
        idleTimer?.clear();
        idleTimer = undefined;
    }

    function clearRetry(): void {
        retryToken += 1;
        retryTimer?.clear();
        retryTimer = undefined;
        pendingRetryAt = undefined;
    }

    function nextTickAtIso(): string | undefined {
        const cronNext = activeCron().nextRun();
        let chosen = cronNext instanceof Date ? cronNext.getTime() : undefined;
        if (chosen !== undefined && Number.isNaN(chosen)) {
            chosen = undefined;
        }
        if (pendingRetryAt !== undefined && (chosen === undefined || pendingRetryAt < chosen)) {
            chosen = pendingRetryAt;
        }
        return chosen === undefined ? undefined : new Date(chosen).toISOString();
    }

    async function publishNextTickAt(): Promise<void> {
        await input.onNextTickAtChange(nextTickAtIso());
    }

    function recordMissed(): void {
        if (stopped || !armed) return;
        missed = true;
        const iso = new Date(now()).toISOString();
        logger.info(
            `scheduled fire at ${iso} skipped while a tick is running; catch-up queued`,
        );
        if (!busy) {
            scheduleIdleCatchUp();
        }
    }

    function scheduleIdleCatchUp(): void {
        if (idleTimer || stopped || !armed) return;
        idleTimer = setTimer(() => {
            idleTimer = undefined;
            if (!missed || busy || stopped || !armed) return;
            void runGuarded('missedFire');
        }, 0);
    }

    function logRetry(lines: LumpLine[]): void {
        for (const line of lines) {
            logger.info(
                `lump "${line.lumpName}": workspace lock wait timed out; retry in ${RETRY_DELAY_SECONDS}s`,
            );
        }
    }

    function logDrop(lines: LumpLine[], nextIso: string): void {
        for (const line of lines) {
            logger.info(
                `lump "${line.lumpName}": workspace lock wait timed out; next scheduled fire at ${nextIso} is within ${RETRY_DELAY_SECONDS}s, not retrying`,
            );
        }
    }

    function scheduleRetry(lines: LumpLine[]): void {
        clearRetry();
        const token = retryToken;
        const owed = dedupeLines(lines);
        pendingRetryAt = now() + CATCH_UP_RETRY_DELAY_MS;
        retryTimer = setTimer(() => {
            if (token !== retryToken || stopped) return;
            retryTimer = undefined;
            pendingRetryAt = undefined;
            void runGuarded('lockRetry', owed);
        }, CATCH_UP_RETRY_DELAY_MS);
    }

    function applyOwedDecision(lines: LumpLine[]): void {
        const owed = dedupeLines(lines);
        if (owed.length === 0) {
            clearRetry();
            return;
        }
        const cronNext = activeCron().nextRun();
        const nextMs = cronNext instanceof Date ? cronNext.getTime() : undefined;
        if (nextMs !== undefined && nextMs - now() > CATCH_UP_RETRY_DELAY_MS) {
            scheduleRetry(owed);
            logRetry(owed);
            return;
        }
        clearRetry();
        if (cronNext instanceof Date) {
            logDrop(owed, cronNext.toISOString());
        }
    }

    async function runTickBody(
        trigger: TickTrigger,
        onlyLines?: LumpLine[],
    ): Promise<LumpLine[]> {
        const result = await input.runTick(
            onlyLines === undefined ? { trigger } : { trigger, onlyLines },
        );
        return dedupeLines(result.owedLines);
    }

    async function drainCatchUp(initialOwed: LumpLine[]): Promise<void> {
        let owed = dedupeLines(initialOwed);
        try {
            while (true) {
                if (stopped) {
                    missed = false;
                    clearRetry();
                    clearIdle();
                    return;
                }
                if (await input.shouldStop()) {
                    missed = false;
                    clearRetry();
                    clearIdle();
                    await publishNextTickAt();
                    missed = false;
                    return;
                }
                if (missed) {
                    missed = false;
                    clearRetry();
                    clearIdle();
                    owed = await runTickBody('missedFire');
                    continue;
                }
                applyOwedDecision(owed);
                if (missed) {
                    continue;
                }
                await publishNextTickAt();
                if (missed) {
                    owed = [];
                    continue;
                }
                return;
            }
        } finally {
            busy = false;
        }
    }

    async function runArmedTick(trigger: TickTrigger, onlyLines?: LumpLine[]): Promise<void> {
        clearRetry();
        clearIdle();
        try {
            const owed = await runTickBody(trigger, onlyLines);
            await drainCatchUp(owed);
        } catch (error) {
            busy = false;
            throw error;
        }
    }

    async function runGuarded(trigger: TickTrigger, onlyLines?: LumpLine[]): Promise<void> {
        if (stopped || !armed) return;
        if (busy) {
            if (trigger !== 'lockRetry') {
                recordMissed();
            }
            return;
        }
        busy = true;
        await runArmedTick(trigger, onlyLines);
    }

    // Croner's protect callback runs only while its own callback is still in progress.
    // Fires during initial, missedFire, and lockRetry ticks arrive through onFire instead.
    function onFire(): Promise<void> {
        return runGuarded('scheduled');
    }

    try {
        cronRef.cron = createCron({
            cronSetup: input.cronSetup,
            name: input.name,
            onFire,
            onProtected: () => {
                recordMissed();
            },
        });
    } catch (error) {
        return failure(failedToStartScheduler(input.cronSetup, error));
    }

    async function start(): Promise<void> {
        if (didStart || stopped) return;
        didStart = true;
        armed = true;
        busy = true;
        activeCron().resume();
        await runArmedTick('initial');
    }

    function stop(): void {
        if (stopped) return;
        stopped = true;
        armed = false;
        clearRetry();
        clearIdle();
        activeCron().stop();
    }

    try {
        await publishNextTickAt();
    } catch (error) {
        stop();
        throw error;
    }

    return success({ start, stop });
}
