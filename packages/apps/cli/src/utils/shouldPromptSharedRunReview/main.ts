import type { RunLumpFromLumpNameSuccess } from '../runLumpFromLumpName';

/**
 * Whether `commands/run` should offer shared commit / exit after a successful walk.
 * True only for shared, not skipped, `result.contextNames.length > 0`.
 */
export function shouldPromptSharedRunReview(input: {
    mode: 'shared' | 'dedicated';
    run: RunLumpFromLumpNameSuccess;
}): boolean {
    const { mode, run } = input;
    if (mode !== 'shared' || run.skipped) {
        return false;
    }
    return run.result.contextNames.length > 0;
}
