import { describe, expect, it } from 'vitest';

import type { LocalConfig } from '../../types/LocalConfig';
import { resolvePrimaryProjectBaseBranch, resolveProjectBaseBranches } from './main';

describe('resolveProjectBaseBranches', () => {
    it('returns singular only (LC-SINGLE)', () => {
        const localConfig: LocalConfig = { mode: 'dedicated', projectBaseBranch: 'main' };
        expect(resolveProjectBaseBranches(localConfig)).toEqual(['main']);
    });

    it('array wins when both fields set (LC-MULTI)', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            projectBaseBranch: 'main',
            projectBaseBranches: ['main', 'ver/0.0.9'],
        };
        expect(resolveProjectBaseBranches(localConfig)).toEqual(['main', 'ver/0.0.9']);
    });

    it('does not merge or append singular when array is set', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            projectBaseBranch: 'develop',
            projectBaseBranches: ['main', 'ver/0.0.9'],
        };
        const branches = resolveProjectBaseBranches(localConfig);
        expect(branches).toEqual(['main', 'ver/0.0.9']);
        expect(branches).not.toContain('develop');
    });

    it('accepts array-only config (LC-MULTI-ARRAY-ONLY)', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            projectBaseBranches: ['main', 'ver/0.0.9'],
        };
        expect(resolveProjectBaseBranches(localConfig)).toEqual(['main', 'ver/0.0.9']);
    });

    it('preserves array order (LC-MULTI-ORDER)', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            projectBaseBranch: 'main',
            projectBaseBranches: ['ver/0.0.9', 'main'],
        };
        expect(resolveProjectBaseBranches(localConfig)).toEqual(['ver/0.0.9', 'main']);
    });
});

describe('resolvePrimaryProjectBaseBranch', () => {
    it('returns projectBaseBranch when set', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            projectBaseBranch: 'develop',
            projectBaseBranches: ['main', 'ver/0.0.9'],
        };
        expect(resolvePrimaryProjectBaseBranch(localConfig)).toBe('develop');
    });

    it('falls back to first effective list element when singular omitted (LC-MULTI-ARRAY-ONLY)', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            projectBaseBranches: ['main', 'ver/0.0.9'],
        };
        expect(resolvePrimaryProjectBaseBranch(localConfig)).toBe('main');
    });
});
