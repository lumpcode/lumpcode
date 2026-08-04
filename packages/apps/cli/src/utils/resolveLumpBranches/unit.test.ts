import { describe, expect, it } from 'vitest';

import type { LocalConfig } from '../../types/LocalConfig';
import {
    resolveLumpBaseBranch,
    resolveLumpBranches,
    resolveLumpDiscoveryBranch,
} from './main';

describe('resolveLumpBranches', () => {
    const primaryBranch = 'main';
    const localConfig: LocalConfig = { mode: 'dedicated', primaryBranch: 'main' };

    it('uses explicit baseBranch for resolvedBaseBranch', () => {
        expect(
            resolveLumpBaseBranch({
                lumpConfig: { baseBranch: 'ver/0.0.9' },
                primaryBranch,
            }),
        ).toBe('ver/0.0.9');
    });

    it('falls back to discoveryBranch when baseBranch is omitted', () => {
        expect(
            resolveLumpBaseBranch({
                lumpConfig: { discoveryBranch: 'ver/0.0.9' },
                primaryBranch,
            }),
        ).toBe('ver/0.0.9');
    });

    it('falls back to primaryBranch when both baseBranch and discoveryBranch are omitted', () => {
        expect(
            resolveLumpBaseBranch({
                lumpConfig: {},
                primaryBranch,
            }),
        ).toBe('main');
    });

    it('resolves discoveryBranch from lump config or primaryBranch', () => {
        expect(
            resolveLumpDiscoveryBranch({
                lumpConfig: { discoveryBranch: 'ver/0.0.9' },
                primaryBranch,
            }),
        ).toBe('ver/0.0.9');
        expect(
            resolveLumpDiscoveryBranch({
                lumpConfig: {},
                primaryBranch,
            }),
        ).toBe('main');
    });

    it('returns both resolved branches via resolveLumpBranches (LUMP-SPLIT)', () => {
        expect(
            resolveLumpBranches({
                lumpConfig: { discoveryBranch: 'main', baseBranch: 'ver/0.0.9' },
                localConfig,
            }),
        ).toEqual({
            resolvedDiscoveryBranch: 'main',
            resolvedBaseBranch: 'ver/0.0.9',
        });
    });
});

/**
 * dynamic-discovery-branch N1–N8.
 * discoveryBranches plural, mutual exclusion, pattern eligibility.
 * Skipped until rule normalize / match helpers land.
 *
 * Helpers under test may be private to resolveLumpBranches or exported —
 * assert via resolve APIs / eligibility helper once implemented.
 */
describe.skip('resolveLumpBranches discovery rules (dynamic-discovery-branch N*)', () => {
    const primaryBranch = 'main';
    const localConfig: LocalConfig = { mode: 'dedicated', primaryBranch: 'main' };

    it('N1: singular discoveryBranch normalizes to one rule', () => {
        expect(
            resolveLumpDiscoveryBranch({
                lumpConfig: { discoveryBranch: 'dev' },
                primaryBranch: 'main',
            }),
        ).toBe('dev');
    });

    it('N2: plural discoveryBranches preserves order', () => {
        const config = { discoveryBranches: ['dev', 'feature/*'] };
        // Post-impl: normalizeDiscoveryRules(config) === ['dev', 'feature/*']
        expect(config.discoveryBranches).toEqual(['dev', 'feature/*']);
        void resolveLumpBranches({
            lumpConfig: config as Parameters<typeof resolveLumpBranches>[0]['lumpConfig'],
            localConfig,
        });
    });

    it('N3: singular + plural fails validation', () => {
        expect(() =>
            resolveLumpBranches({
                lumpConfig: {
                    discoveryBranch: 'dev',
                    discoveryBranches: ['feature/*'],
                } as Parameters<typeof resolveLumpBranches>[0]['lumpConfig'],
                localConfig,
            }),
        ).toThrow(/discoveryBranch|discoveryBranches|mutually|exclusive/i);
    });

    it('N4: omit both → effective exact primary', () => {
        expect(
            resolveLumpDiscoveryBranch({
                lumpConfig: {},
                primaryBranch: 'dev',
            }),
        ).toBe('dev');
    });

    it('N5: scan matches exact rule → eligible (via discovery match helper)', async () => {
        // Post-impl: export or reuse match helper from resolveLumpBranches / discover filter.
        const { branchMatchesGitGlob } = await import('../branchMatchesGitGlob');
        const { isGitRefGlob } = await import('../isGitRefGlob');
        const rules = ['dev', 'feature/*'];
        const scan = 'dev';
        const eligible = rules.some((rule) =>
            isGitRefGlob(rule)
                ? branchMatchesGitGlob({ pattern: rule, branch: scan })
                : rule === scan,
        );
        expect(eligible).toBe(true);
    });

    it('N6: scan matches pattern rule → eligible', async () => {
        const { branchMatchesGitGlob } = await import('../branchMatchesGitGlob');
        const { isGitRefGlob } = await import('../isGitRefGlob');
        const rules = ['dev', 'feature/*'];
        const scan = 'feature/a';
        const eligible = rules.some((rule) =>
            isGitRefGlob(rule)
                ? branchMatchesGitGlob({ pattern: rule, branch: scan })
                : rule === scan,
        );
        expect(eligible).toBe(true);
    });

    it('N7: scan non-match is not eligible', async () => {
        const { branchMatchesGitGlob } = await import('../branchMatchesGitGlob');
        const { isGitRefGlob } = await import('../isGitRefGlob');
        const rules = ['dev', 'feature/*'];
        const scan = 'release/1';
        const eligible = rules.some((rule) =>
            isGitRefGlob(rule)
                ? branchMatchesGitGlob({ pattern: rule, branch: scan })
                : rule === scan,
        );
        expect(eligible).toBe(false);
    });

    it('N8: omitted baseBranch falls back to concrete discovery (string path)', () => {
        expect(
            resolveLumpBaseBranch({
                lumpConfig: { discoveryBranch: 'feature/a' },
                primaryBranch,
            }),
        ).toBe('feature/a');
    });
});
