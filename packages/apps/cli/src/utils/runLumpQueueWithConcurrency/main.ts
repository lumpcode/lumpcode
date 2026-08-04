export type RunLumpQueueWithConcurrencyInput = {
    lumpNames: string[];
    concurrency: number;
    runOneLump: (input: { lumpName: string }) => Promise<unknown>;
};

/**
 * Runs lump names through a work-queue pool capped at `concurrency`.
 * Preserves queue-head start order; isolates failures so one lump cannot
 * cancel siblings or prevent the remaining queue from draining.
 */
export async function runLumpQueueWithConcurrency(
    input: RunLumpQueueWithConcurrencyInput,
): Promise<void> {
    const { lumpNames, runOneLump } = input;
    if (lumpNames.length === 0) {
        return;
    }

    const concurrency = Math.max(1, Math.floor(input.concurrency));
    let nextIndex = 0;

    async function worker(): Promise<void> {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= lumpNames.length) {
                return;
            }
            const lumpName = lumpNames[index]!;
            try {
                await runOneLump({ lumpName });
            } catch {
                // Failure isolation: log/handle at the call site; keep draining.
            }
        }
    }

    const workerCount = Math.min(concurrency, lumpNames.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
