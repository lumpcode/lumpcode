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
