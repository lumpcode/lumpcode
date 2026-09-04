import type { LumpLine } from '../lumpLine';

export type RunLumpLinesWithConcurrencyInput = {
    items: LumpLine[];
    concurrency: number;
    runLumpLine: (line: LumpLine) => Promise<unknown>;
};

/**
 * Runs lump lines through a work-queue pool capped at `concurrency`.
 * Preserves queue-head start order; isolates failures so one line cannot
 * cancel siblings or prevent the remaining queue from draining.
 */
export async function runLumpLinesWithConcurrency(
    input: RunLumpLinesWithConcurrencyInput,
): Promise<void> {
    const { runLumpLine, items } = input;

    if (items.length === 0) {
        return;
    }

    const concurrency = Math.max(1, Math.floor(input.concurrency));
    let nextIndex = 0;

    async function worker(): Promise<void> {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= items.length) {
                return;
            }
            const item = items[index]!;
            try {
                await runLumpLine(item);
            } catch {
                // Failure isolation: log/handle at the call site; keep draining.
            }
        }
    }

    const workerCount = Math.min(concurrency, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
