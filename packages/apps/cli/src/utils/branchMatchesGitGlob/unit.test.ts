import { describe, expect, it } from 'vitest';

import { branchMatchesGitGlob } from './main';

/**
 * dynamic-discovery-branch G3–G6.
 * Skipped until branchMatchesGitGlob is implemented.
 *
 * `*` segment semantics follow `git ls-remote --heads origin <pattern>` for the
 * cases below; if git treats multi-segment names differently, align the
 * implementation (and these expectations) to observed git behavior.
 */
describe('branchMatchesGitGlob (dynamic-discovery-branch G*)', () => {
    it('G3: exact equality when pattern is an exact name', () => {
        // Prefer exact string equality at call sites for non-glob rules.
        // When this helper is used with an exact pattern, equality must hold.
        expect(
            branchMatchesGitGlob({ pattern: 'feature/a', branch: 'feature/a' }),
        ).toBe(true);
        expect(
            branchMatchesGitGlob({ pattern: 'feature/a', branch: 'feature/b' }),
        ).toBe(false);
    });

    it('G4: * matches a single path segment', () => {
        expect(
            branchMatchesGitGlob({ pattern: 'feature/*', branch: 'feature/a' }),
        ).toBe(true);
        expect(
            branchMatchesGitGlob({ pattern: 'feature/*', branch: 'feature/b' }),
        ).toBe(true);
        expect(
            branchMatchesGitGlob({ pattern: 'feature/*', branch: 'feature/a/b' }),
        ).toBe(false);
        expect(
            branchMatchesGitGlob({ pattern: 'feature/*', branch: 'dev' }),
        ).toBe(false);
    });

    it('G5: ? matches a single character', () => {
        expect(
            branchMatchesGitGlob({ pattern: 'feature/?', branch: 'feature/a' }),
        ).toBe(true);
        expect(
            branchMatchesGitGlob({ pattern: 'feature/?', branch: 'feature/ab' }),
        ).toBe(false);
    });

    it('G6: exact rule never glob-matches a different name', () => {
        expect(
            branchMatchesGitGlob({ pattern: 'feature/a', branch: 'feature/b' }),
        ).toBe(false);
    });
});
