export type RunLumpQueueItem = {
    lumpName: string;
    effectiveDiscoveryBranch?: string;
};

export type RunLumpQueueWithConcurrencyInput = {
    /** Preferred queue entries (supports same lumpName on multiple discovery lines). */
    items?: RunLumpQueueItem[];
    /** Legacy: lump names only (no per-item discovery). Ignored when `items` is set. */
    lumpNames?: string[];
    concurrency: number;
    runOneLump: (input: {
        lumpName: string;
        effectiveDiscoveryBranch?: string;
    }) => Promise<unknown>;
};

/**
 * Runs lump queue items through a work-queue pool capped at `concurrency`.
 * Preserves queue-head start order; isolates failures so one lump cannot
 * cancel siblings or prevent the remaining queue from draining.
 */
export async function runLumpQueueWithConcurrency(
    input: RunLumpQueueWithConcurrencyInput,
): Promise<void> {
    const { runOneLump } = input;
    const items: RunLumpQueueItem[] =
        input.items ??
        (input.lumpNames ?? []).map((lumpName) => ({ lumpName }));

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
                await runOneLump({
                    lumpName: item.lumpName,
                    effectiveDiscoveryBranch: item.effectiveDiscoveryBranch,
                });
            } catch {
                // Failure isolation: log/handle at the call site; keep draining.
            }
        }
    }

    const workerCount = Math.min(concurrency, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
