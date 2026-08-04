import { describe, expect, it } from 'vitest';

import { resolvePrimaryBranches } from '../resolvePrimaryBranches';
import { validateLumpDiscoveryBranchAllowlist } from './main';

describe('validateLumpDiscoveryBranchAllowlist', () => {
    const effectivePrimaryBranches = ['main', 'ver/0.0.9'];

    it('returns success for a listed discoveryBranch', () => {
        const result = validateLumpDiscoveryBranchAllowlist({
            mode: 'dedicated',
            lumpName: 'releaseLine',
            resolvedDiscoveryBranch: 'ver/0.0.9',
            effectivePrimaryBranches,
        });
        expect(result.success).toBe(true);
    });

    it('returns failure for an unlisted discoveryBranch with lump name and branch in message', () => {
        const result = validateLumpDiscoveryBranchAllowlist({
            mode: 'dedicated',
            lumpName: 'legacyLine',
            resolvedDiscoveryBranch: 'ver/0.0.7',
            effectivePrimaryBranches,
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/legacyLine/i);
        expect(result.data).toMatch(/ver\/0\.0\.7/);
    });

    it('returns success in shared mode regardless of discoveryBranch (no allowlist)', () => {
        const result = validateLumpDiscoveryBranchAllowlist({
            mode: 'shared',
            lumpName: 'legacyLine',
            resolvedDiscoveryBranch: 'ver/0.0.7',
            effectivePrimaryBranches,
        });
        expect(result.success).toBe(true);
    });

    it('uses effective list from resolvePrimaryBranches (LC-MULTI + LUMP-VER)', () => {
        const localConfig = {
            mode: 'dedicated' as const,
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        };
        const branches = resolvePrimaryBranches(localConfig);
        const result = validateLumpDiscoveryBranchAllowlist({
            mode: 'dedicated',
            lumpName: 'releaseLine',
            resolvedDiscoveryBranch: 'ver/0.0.9',
            effectivePrimaryBranches: branches,
        });
        expect(result.success).toBe(true);
    });
});

/**
 * dynamic-discovery-branch A1–A7.
 * Allowlist against **unexpanded** primaryBranches (exact-via-glob + pattern equality).
 * Skipped until glob allowlist lands. Input shape may grow to accept rule lists.
 */
describe('validateLumpDiscoveryBranchAllowlist globs (dynamic-discovery-branch A*)', () => {
    const primaries = ['dev', 'feature/*'];

    it('A1: exact primary entry succeeds', () => {
        const result = validateLumpDiscoveryBranchAllowlist({
            mode: 'dedicated',
            lumpName: 'multi',
            resolvedDiscoveryBranch: 'dev',
            effectivePrimaryBranches: primaries,
        });
        expect(result.success).toBe(true);
    });

    it('A2: concrete exact allowlisted via primary glob', () => {
        const result = validateLumpDiscoveryBranchAllowlist({
            mode: 'dedicated',
            lumpName: 'multi',
            resolvedDiscoveryBranch: 'feature/a',
            effectivePrimaryBranches: primaries,
        });
        expect(result.success).toBe(true);
    });

    it('A3: pattern rule equality with primary glob entry', () => {
        const result = validateLumpDiscoveryBranchAllowlist({
            mode: 'dedicated',
            lumpName: 'multi',
            resolvedDiscoveryBranch: 'feature/*',
            effectivePrimaryBranches: primaries,
        });
        expect(result.success).toBe(true);
    });

    it('A4: pattern not in primaries fails with lump name + rule', () => {
        const result = validateLumpDiscoveryBranchAllowlist({
            mode: 'dedicated',
            lumpName: 'hotfixLump',
            resolvedDiscoveryBranch: 'hotfix/*',
            effectivePrimaryBranches: primaries,
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/hotfixLump/);
        expect(result.data).toMatch(/hotfix\/\*/);
    });

    it('A5: exact not covered by primaries fails', () => {
        const result = validateLumpDiscoveryBranchAllowlist({
            mode: 'dedicated',
            lumpName: 'legacy',
            resolvedDiscoveryBranch: 'ver/0.0.7',
            effectivePrimaryBranches: primaries,
        });
        expect(result.success).toBe(false);
    });

    it('A6: shared skips allowlist', () => {
        const result = validateLumpDiscoveryBranchAllowlist({
            mode: 'shared',
            lumpName: 'any',
            resolvedDiscoveryBranch: 'ver/x',
            effectivePrimaryBranches: primaries,
        });
        expect(result.success).toBe(true);
    });

    it('A7: existing exact-list cases still pass/fail', () => {
        const exactPrimaries = ['main', 'ver/0.0.9'];
        expect(
            validateLumpDiscoveryBranchAllowlist({
                mode: 'dedicated',
                lumpName: 'releaseLine',
                resolvedDiscoveryBranch: 'ver/0.0.9',
                effectivePrimaryBranches: exactPrimaries,
            }).success,
        ).toBe(true);
        expect(
            validateLumpDiscoveryBranchAllowlist({
                mode: 'dedicated',
                lumpName: 'legacyLine',
                resolvedDiscoveryBranch: 'ver/0.0.7',
                effectivePrimaryBranches: exactPrimaries,
            }).success,
        ).toBe(false);
    });
});
