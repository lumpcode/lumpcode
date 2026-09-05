import type { LumpLine } from '../lumpLine';

export type RunLumpLinesWithConcurrencyInput = {
    items: LumpLine[];
    concurrency: number;
    runLumpLine: (line: LumpLine) => Promise<unknown>;
};

function lineKey(line: LumpLine): string {
    return `${line.lumpName}\0${line.effectiveDiscoveryBranch ?? ''}`;
}

/**
 * Runs lump lines through a work-queue pool capped at `concurrency`.
 * Preserves queue-head start order; isolates failures so one line cannot
 * cancel siblings or prevent the remaining queue from draining.
 * Same `lumpName` + `effectiveDiscoveryBranch` never overlap (omitted
 * branch is the empty string).
 */
export async function runLumpLinesWithConcurrency(
    input: RunLumpLinesWithConcurrencyInput,
): Promise<void> {
    const { runLumpLine, items } = input;

    if (items.length === 0) {
        return;
    }

    const concurrency = Math.max(1, Math.floor(input.concurrency));
    const pending = items.slice();
    const inFlight = new Set<string>();
    const waiters: Array<() => void> = [];

    function notifyWaiters(): void {
        const queued = waiters.splice(0);
        for (const wake of queued) {
            wake();
        }
    }

    function takeNext(): LumpLine | undefined | 'blocked' {
        if (pending.length === 0) {
            return undefined;
        }
        for (let i = 0; i < pending.length; i++) {
            const item = pending[i]!;
            const key = lineKey(item);
            if (!inFlight.has(key)) {
                pending.splice(i, 1);
                inFlight.add(key);
                return item;
            }
        }
        return 'blocked';
    }

    async function acquire(): Promise<LumpLine | undefined> {
        while (true) {
            const next = takeNext();
            if (next === undefined) {
                return undefined;
            }
            if (next !== 'blocked') {
                return next;
            }
            await new Promise<void>((resolve) => {
                waiters.push(resolve);
            });
        }
    }

    function release(line: LumpLine): void {
        inFlight.delete(lineKey(line));
        notifyWaiters();
    }

    async function worker(): Promise<void> {
        while (true) {
            const item = await acquire();
            if (item === undefined) {
                return;
            }
            try {
                await runLumpLine(item);
            } catch {
                // Failure isolation: log/handle at the call site; keep draining.
            } finally {
                release(item);
            }
        }
    }

    const workerCount = Math.min(concurrency, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
