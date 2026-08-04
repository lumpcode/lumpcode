import { describe, expect, it, vi } from 'vitest';

import type { LocalConfig } from '../../types/LocalConfig';
import { resolvePrimaryBranch, resolvePrimaryBranches } from './main';

describe('resolvePrimaryBranches', () => {
    it('returns singular only (LC-SINGLE)', () => {
        const localConfig: LocalConfig = { mode: 'dedicated', primaryBranch: 'main' };
        expect(resolvePrimaryBranches(localConfig)).toEqual(['main']);
    });

    it('array wins when both fields set (LC-MULTI)', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        };
        expect(resolvePrimaryBranches(localConfig)).toEqual(['main', 'ver/0.0.9']);
    });

    it('does not merge or append singular when array is set', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranch: 'develop',
            primaryBranches: ['main', 'ver/0.0.9'],
        };
        const branches = resolvePrimaryBranches(localConfig);
        expect(branches).toEqual(['main', 'ver/0.0.9']);
        expect(branches).not.toContain('develop');
    });

    it('accepts array-only config (LC-MULTI-ARRAY-ONLY)', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranches: ['main', 'ver/0.0.9'],
        };
        expect(resolvePrimaryBranches(localConfig)).toEqual(['main', 'ver/0.0.9']);
    });

    it('preserves array order (LC-MULTI-ORDER)', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['ver/0.0.9', 'main'],
        };
        expect(resolvePrimaryBranches(localConfig)).toEqual(['ver/0.0.9', 'main']);
    });
});

describe('resolvePrimaryBranch', () => {
    it('falls back to deprecated projectBaseBranch and warns once (LC-LEGACY)', () => {
        const localConfig: LocalConfig = { mode: 'dedicated', projectBaseBranch: 'develop' };
        const warn = vi.fn();
        expect(resolvePrimaryBranch(localConfig, { warn })).toBe('develop');
        resolvePrimaryBranch(localConfig, { warn });
        expect(warn).toHaveBeenCalledOnce();
        expect(warn.mock.calls[0]![0]).toMatch(/projectBaseBranch.*deprecated/i);
    });

    it('returns first element of effective list (LC-MULTI)', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranch: 'develop',
            primaryBranches: ['main', 'ver/0.0.9'],
        };
        expect(resolvePrimaryBranch(localConfig)).toBe('main');
    });

    it('falls back to first effective list element when singular omitted (LC-MULTI-ARRAY-ONLY)', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranches: ['main', 'ver/0.0.9'],
        };
        expect(resolvePrimaryBranch(localConfig)).toBe('main');
    });
});

/**
 * dynamic-discovery-branch P1–P6.
 * Primary = first **exact** entry; all-glob configs fail.
 * Skipped until resolvePrimaryBranch / validation lands.
 */
describe.skip('resolvePrimaryBranches first-exact primary (dynamic-discovery-branch P*)', () => {
    it('P1: first exact amid leading globs', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranches: ['feature/*', 'dev', 'main'],
        };
        expect(resolvePrimaryBranch(localConfig)).toBe('dev');
    });

    it('P2: leading exact wins', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranches: ['dev', 'feature/*'],
        };
        expect(resolvePrimaryBranch(localConfig)).toBe('dev');
    });

    it('P3: all-glob array fails', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranches: ['feature/*'],
        };
        expect(() => resolvePrimaryBranch(localConfig)).toThrow(/exact|glob|primary/i);
    });

    it('P4: singular glob primaryBranch fails', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranch: 'feature/*',
        };
        expect(() => resolvePrimaryBranch(localConfig)).toThrow(/exact|glob|primary/i);
    });

    it('P5: non-empty primaryBranches still wins over singular; first-exact applies', () => {
        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranch: 'develop',
            primaryBranches: ['feature/*', 'main'],
        };
        expect(resolvePrimaryBranches(localConfig)).toEqual(['feature/*', 'main']);
        expect(resolvePrimaryBranch(localConfig)).toBe('main');
    });

    it('P6: legacy projectBaseBranch still works as exact primary', () => {
        const localConfig: LocalConfig = { mode: 'dedicated', projectBaseBranch: 'dev' };
        const warn = vi.fn();
        expect(resolvePrimaryBranch(localConfig, { warn })).toBe('dev');
        resolvePrimaryBranch(localConfig, { warn });
        expect(warn).toHaveBeenCalledOnce();
    });
});
