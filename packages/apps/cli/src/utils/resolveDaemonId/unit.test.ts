import { describe, expect, it } from 'vitest';
import { failure, success } from '@lumpcode/core';

import { resolveDaemonId } from './main';

/**
 * daemon-id-and-filters ID1–ID14.
 * Skipped until resolveDaemonId is implemented.
 */
describe('resolveDaemonId (daemon-id-and-filters ID*)', () => {
    it('ID1: unfiltered default → global', () => {
        const result = resolveDaemonId({
            existingDaemonIds: new Set(),
        });
        expect(result).toEqual(success('global'));
    });

    it('ID2: unfiltered + explicit other id', () => {
        const result = resolveDaemonId({
            explicitDaemonId: 'agents',
            existingDaemonIds: new Set(),
        });
        expect(result).toEqual(success('agents'));
    });

    it('ID3: global + any include fails (reserved)', () => {
        const result = resolveDaemonId({
            explicitDaemonId: 'global',
            include: ['alpha'],
            existingDaemonIds: new Set(),
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/reserved|unfiltered|global/i);
    });

    it('ID4: global + any exclude fails (reserved)', () => {
        const result = resolveDaemonId({
            explicitDaemonId: 'global',
            exclude: ['alpha'],
            existingDaemonIds: new Set(),
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/reserved|unfiltered|global/i);
    });

    it('ID5: single exact include auto → that name', () => {
        const result = resolveDaemonId({
            include: ['backlog'],
            existingDaemonIds: new Set(),
        });
        expect(result).toEqual(success('backlog'));
    });

    it('ID6: exact include taken → name-2', () => {
        const result = resolveDaemonId({
            include: ['backlog'],
            existingDaemonIds: new Set(['backlog']),
        });
        expect(result).toEqual(success('backlog-2'));
    });

    it('ID7: exact include -2 taken → name-3', () => {
        const result = resolveDaemonId({
            include: ['backlog'],
            existingDaemonIds: new Set(['backlog', 'backlog-2']),
        });
        expect(result).toEqual(success('backlog-3'));
    });

    it('ID8: auto would be global under filter → fail', () => {
        const result = resolveDaemonId({
            include: ['global'],
            existingDaemonIds: new Set(),
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/daemonId|--daemonId|reserved|global/i);
    });

    it('ID9: multi include auto → d- + injected hex', () => {
        const result = resolveDaemonId({
            include: ['a', 'b'],
            existingDaemonIds: new Set(),
            randomHex6: () => 'abcdef',
        });
        expect(result).toEqual(success('d-abcdef'));
    });

    it('ID10: glob include auto → d-xxxxxx', () => {
        const result = resolveDaemonId({
            include: ['refacto-*'],
            existingDaemonIds: new Set(),
            randomHex6: () => '123456',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/^d-[0-9a-f]{6}$/);
        expect(result.data).toBe('d-123456');
    });

    it('ID11: multi + clash retry', () => {
        const hex = ['aaaaaa', 'bbbbbb'];
        let i = 0;
        const result = resolveDaemonId({
            include: ['a', 'b'],
            existingDaemonIds: new Set(['d-aaaaaa']),
            randomHex6: () => hex[i++]!,
        });
        expect(result).toEqual(success('d-bbbbbb'));
    });

    it('ID12: explicit id in use → daemonIdInUse', () => {
        const result = resolveDaemonId({
            explicitDaemonId: 'agents',
            existingDaemonIds: new Set(['agents']),
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/daemonIdInUse|already|in use/i);
        // Prefer structured failure when implementation uses Failure payload with code;
        // string Failure must still mention the code/name.
        expect(failure(result.data).data).toMatch(/daemonIdInUse|agents/i);
    });

    it('ID13: invalid charset fails', () => {
        for (const explicitDaemonId of ['bad id', 'foo/bar']) {
            const result = resolveDaemonId({
                explicitDaemonId,
                existingDaemonIds: new Set(),
            });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toMatch(/invalid|charset|daemonId|[a-zA-Z0-9_-]/i);
        }
    });

    it('ID14: exclude-only counts as filtered (not global)', () => {
        const result = resolveDaemonId({
            exclude: ['alpha'],
            existingDaemonIds: new Set(),
            randomHex6: () => 'fedcba',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).not.toBe('global');
        expect(result.data).toMatch(/^d-[0-9a-f]{6}$/);
    });
});
