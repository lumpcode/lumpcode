import { describe, expect, it } from 'vitest';

import { resolveDiscoveryBranches } from '../resolveDiscoveryBranches';
import { validateLumpDiscoveryBranchAllowlist } from './main';

describe('validateLumpDiscoveryBranchAllowlist', () => {
    const effectiveDiscoveryBranches = ['main', 'ver/0.0.9'];

    it('returns success for a listed discoveryBranch', () => {
        const result = validateLumpDiscoveryBranchAllowlist({
            mode: 'dedicated',
            lumpName: 'releaseLine',
            resolvedDiscoveryBranch: 'ver/0.0.9',
            effectiveDiscoveryBranches,
        });
        expect(result.success).toBe(true);
    });

    it('returns failure for an unlisted discoveryBranch with lump name and branch in message', () => {
        const result = validateLumpDiscoveryBranchAllowlist({
            mode: 'dedicated',
            lumpName: 'legacyLine',
            resolvedDiscoveryBranch: 'ver/0.0.7',
            effectiveDiscoveryBranches,
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
            effectiveDiscoveryBranches,
        });
        expect(result.success).toBe(true);
    });

    it('uses effective list from resolveDiscoveryBranches (LC-MULTI + LUMP-VER)', () => {
        const localConfig = {
            mode: 'dedicated' as const,
            discoveryBranch: 'main',
            discoveryBranches: ['main', 'ver/0.0.9'],
        };
        const branches = resolveDiscoveryBranches(localConfig);
        const result = validateLumpDiscoveryBranchAllowlist({
            mode: 'dedicated',
            lumpName: 'releaseLine',
            resolvedDiscoveryBranch: 'ver/0.0.9',
            effectiveDiscoveryBranches: branches,
        });
        expect(result.success).toBe(true);
    });
});
