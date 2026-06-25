import { describe, expect, it } from 'vitest';

import { resolveProjectBaseBranches } from '../resolveProjectBaseBranches';
import { validateLumpBaseBranchAllowlist } from './main';

describe('validateLumpBaseBranchAllowlist', () => {
    const effectiveBranches = ['main', 'ver/0.0.9'];

    it('returns success for a listed branch', () => {
        const result = validateLumpBaseBranchAllowlist({
            lumpName: 'releaseLine',
            resolvedBaseBranch: 'ver/0.0.9',
            effectiveBranches,
        });
        expect(result.success).toBe(true);
    });

    it('returns failure for an unlisted branch with lump name and branch in message', () => {
        const result = validateLumpBaseBranchAllowlist({
            lumpName: 'legacyLine',
            resolvedBaseBranch: 'ver/0.0.7',
            effectiveBranches,
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/legacyLine/i);
        expect(result.data).toMatch(/ver\/0\.0\.7/);
    });

    it('returns success when allowUnlistedBaseBranch is true', () => {
        const result = validateLumpBaseBranchAllowlist({
            lumpName: 'legacyLine',
            resolvedBaseBranch: 'ver/0.0.7',
            effectiveBranches,
            allowUnlistedBaseBranch: true,
        });
        expect(result.success).toBe(true);
    });

    it('uses effective list from resolveProjectBaseBranches (LC-MULTI + LUMP-VER)', () => {
        const localConfig = {
            mode: 'dedicated' as const,
            projectBaseBranch: 'main',
            projectBaseBranches: ['main', 'ver/0.0.9'],
        };
        const branches = resolveProjectBaseBranches(localConfig);
        const result = validateLumpBaseBranchAllowlist({
            lumpName: 'releaseLine',
            resolvedBaseBranch: 'ver/0.0.9',
            effectiveBranches: branches,
        });
        expect(result.success).toBe(true);
    });
});
