import { describe, expect, it } from 'vitest';

import type { LocalConfig } from '../../types/LocalConfig';
import {
    resolveLumpBaseBranch,
    resolveLumpBranches,
    resolveLumpDiscoveryBranch,
} from './main';

describe('resolveLumpBranches', () => {
    const primaryDiscoveryBranch = 'main';
    const localConfig: LocalConfig = { mode: 'dedicated', discoveryBranch: 'main' };

    it('uses explicit baseBranch for resolvedBaseBranch', () => {
        expect(
            resolveLumpBaseBranch({
                lumpConfig: { baseBranch: 'ver/0.0.9' },
                primaryDiscoveryBranch,
            }),
        ).toBe('ver/0.0.9');
    });

    it('falls back to discoveryBranch when baseBranch is omitted', () => {
        expect(
            resolveLumpBaseBranch({
                lumpConfig: { discoveryBranch: 'ver/0.0.9' },
                primaryDiscoveryBranch,
            }),
        ).toBe('ver/0.0.9');
    });

    it('falls back to primaryDiscoveryBranch when both baseBranch and discoveryBranch are omitted', () => {
        expect(
            resolveLumpBaseBranch({
                lumpConfig: {},
                primaryDiscoveryBranch,
            }),
        ).toBe('main');
    });

    it('falls back to project.json projectBaseBranch as legacy last priority', () => {
        expect(
            resolveLumpBaseBranch({
                lumpConfig: {},
                primaryDiscoveryBranch,
                projectJsonBaseBranch: 'legacy-main',
            }),
        ).toBe('legacy-main');
    });

    it('resolves discoveryBranch from lump config or primaryDiscoveryBranch', () => {
        expect(
            resolveLumpDiscoveryBranch({
                lumpConfig: { discoveryBranch: 'ver/0.0.9' },
                primaryDiscoveryBranch,
            }),
        ).toBe('ver/0.0.9');
        expect(
            resolveLumpDiscoveryBranch({
                lumpConfig: {},
                primaryDiscoveryBranch,
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
