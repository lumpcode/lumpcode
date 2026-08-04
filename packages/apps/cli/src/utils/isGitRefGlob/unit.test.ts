import { describe, expect, it } from 'vitest';

import { isGitRefGlob } from './main';

/**
 * dynamic-discovery-branch G1–G2.
 * Skipped until isGitRefGlob is implemented.
 */
describe('isGitRefGlob (dynamic-discovery-branch G*)', () => {
    it('G1: exact branch names are not patterns', () => {
        expect(isGitRefGlob('dev')).toBe(false);
        expect(isGitRefGlob('feature/a')).toBe(false);
        expect(isGitRefGlob('main')).toBe(false);
    });

    it('G2: glob metacharacters mark a pattern', () => {
        expect(isGitRefGlob('feature/*')).toBe(true);
        expect(isGitRefGlob('feature/?')).toBe(true);
        expect(isGitRefGlob('feat*/a')).toBe(true);
    });
});
