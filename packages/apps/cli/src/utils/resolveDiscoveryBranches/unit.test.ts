import { describe, expect, it } from 'vitest';

import type { LocalConfig } from '../../types/LocalConfig';
import { resolveDiscoveryBranches, resolvePrimaryDiscoveryBranch } from './main';

describe('resolveDiscoveryBranches', () => {
    it('returns singular only (LC-SINGLE)', () => {
        const localConfig: LocalConfig = { mode: 'dedicated', discoveryBranch: 'main' };
        expect(resolveDiscoveryBranches(localConfig)).toEqual(['main']);
    });

    it('array wins when both fields set (LC-MULTI)', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            discoveryBranch: 'main',
            discoveryBranches: ['main', 'ver/0.0.9'],
        };
        expect(resolveDiscoveryBranches(localConfig)).toEqual(['main', 'ver/0.0.9']);
    });

    it('does not merge or append singular when array is set', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            discoveryBranch: 'develop',
            discoveryBranches: ['main', 'ver/0.0.9'],
        };
        const branches = resolveDiscoveryBranches(localConfig);
        expect(branches).toEqual(['main', 'ver/0.0.9']);
        expect(branches).not.toContain('develop');
    });

    it('accepts array-only config (LC-MULTI-ARRAY-ONLY)', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            discoveryBranches: ['main', 'ver/0.0.9'],
        };
        expect(resolveDiscoveryBranches(localConfig)).toEqual(['main', 'ver/0.0.9']);
    });

    it('preserves array order (LC-MULTI-ORDER)', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            discoveryBranch: 'main',
            discoveryBranches: ['ver/0.0.9', 'main'],
        };
        expect(resolveDiscoveryBranches(localConfig)).toEqual(['ver/0.0.9', 'main']);
    });
});

describe('resolvePrimaryDiscoveryBranch', () => {
    it('returns first element of effective list (LC-MULTI)', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            discoveryBranch: 'develop',
            discoveryBranches: ['main', 'ver/0.0.9'],
        };
        expect(resolvePrimaryDiscoveryBranch(localConfig)).toBe('main');
    });

    it('falls back to first effective list element when singular omitted (LC-MULTI-ARRAY-ONLY)', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            discoveryBranches: ['main', 'ver/0.0.9'],
        };
        expect(resolvePrimaryDiscoveryBranch(localConfig)).toBe('main');
    });
});
