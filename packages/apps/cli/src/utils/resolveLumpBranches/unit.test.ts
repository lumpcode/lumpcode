import { describe, expect, it } from 'vitest';

import type { LocalConfig } from '../../types/LocalConfig';
import {
    resolveLumpBaseBranch,
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
});

/**
 * dynamic-discovery-branch N1–N8.
 * discoveryBranches plural, mutual exclusion, pattern eligibility.
 * Skipped until rule normalize / match helpers land.
 *
 * Helpers under test may be private to resolveLumpBranches or exported —
 * assert via resolve APIs / eligibility helper once implemented.
 */
describe('resolveLumpBranches discovery rules (dynamic-discovery-branch N*)', () => {
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

    it('N2: omit both → effective exact primary', () => {
        expect(
            resolveLumpDiscoveryBranch({
                lumpConfig: {},
                primaryBranch: 'dev',
            }),
        ).toBe('dev');
    });

    it('N3: scan matches exact rule → eligible (via discovery match helper)', async () => {
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

    it('N4: scan matches pattern rule → eligible', async () => {
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

    it('N5: scan non-match is not eligible', async () => {
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

    it('N6: omitted baseBranch falls back to concrete discovery (string path)', () => {
        expect(
            resolveLumpBaseBranch({
                lumpConfig: { discoveryBranch: 'feature/a' },
                primaryBranch,
            }),
        ).toBe('feature/a');
    });
});
