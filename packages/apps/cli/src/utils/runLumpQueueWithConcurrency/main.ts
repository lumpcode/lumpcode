export type RunLumpQueueWithConcurrencyInput = {
    lumpNames: string[];
    concurrency: number;
    runOneLump: (input: { lumpName: string }) => Promise<unknown>;
};

/**
 * Runs lump names through a work-queue pool capped at `concurrency`.
 * Stub for parallel-global-daemon-worktree — implement during feature stage.
 */
export async function runLumpQueueWithConcurrency(
    _input: RunLumpQueueWithConcurrencyInput,
): Promise<void> {
    throw new Error('not implemented');
}
