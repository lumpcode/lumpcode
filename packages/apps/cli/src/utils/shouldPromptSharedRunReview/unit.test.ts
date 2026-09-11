import { describe, expect, it } from 'vitest';

import type { RunLumpFromLumpNameSuccess } from '../runLumpFromLumpName';
import { shouldPromptSharedRunReview } from './main';

function walked(contextNames: string[]): RunLumpFromLumpNameSuccess {
    return {
        skipped: false,
        result: { branchName: 'feat', contextNames, contextRunStateList: [] },
    };
}

describe.skip('shouldPromptSharedRunReview (shared-run-review)', () => {
    it('is true for a shared walk with contexts', () => {
        expect(shouldPromptSharedRunReview({ mode: 'shared', run: walked(['a', 'b']) })).toBe(true);
    });

    it('is false when the run was skipped', () => {
        expect(shouldPromptSharedRunReview({
            mode: 'shared',
            run: { skipped: true, reason: 'disabled', reasonDetail: 'off' },
        })).toBe(false);
        expect(shouldPromptSharedRunReview({
            mode: 'shared',
            run: {
                skipped: true,
                reason: 'tooManyOpenBranches',
                reasonDetail: 'cap',
                openBranchCount: 2,
                maximumNumberOfConcurrentBranches: 1,
            },
        })).toBe(false);
    });

    it('is false when contextNames is empty', () => {
        expect(shouldPromptSharedRunReview({ mode: 'shared', run: walked([]) })).toBe(false);
    });

    it('is false in dedicated mode even with contexts', () => {
        expect(shouldPromptSharedRunReview({ mode: 'dedicated', run: walked(['a']) })).toBe(false);
    });
});
