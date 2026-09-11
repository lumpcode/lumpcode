import type { RunLumpFromLumpNameSuccess } from '../runLumpFromLumpName';

/**
 * Whether `commands/run` should offer shared commit / exit after a successful walk.
 * True only for shared, not skipped, `result.contextNames.length > 0`.
 */
export function shouldPromptSharedRunReview(_input: {
    mode: 'shared' | 'dedicated';
    run: RunLumpFromLumpNameSuccess;
}): boolean {
    throw new Error('not implemented');
}
