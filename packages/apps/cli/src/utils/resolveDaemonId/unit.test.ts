import { describe, expect, it } from 'vitest';

import { RESERVED_DAEMON_ID } from '../daemonFileBaseName';
import { resolveDaemonId } from './main';

describe('resolveDaemonId', () => {
    it('defaults unfiltered to global', () => {
        const result = resolveDaemonId({
            filter: {},
            existingDaemonIds: new Set(),
        });
        expect(result).toEqual({ success: true, data: RESERVED_DAEMON_ID });
    });

    it('allows custom id for unfiltered', () => {
        const result = resolveDaemonId({
            explicitDaemonId: 'nightly',
            filter: {},
            existingDaemonIds: new Set(),
        });
        expect(result).toEqual({ success: true, data: 'nightly' });
    });

    it('rejects global with a filter', () => {
        const result = resolveDaemonId({
            explicitDaemonId: 'global',
            filter: { include: ['a'] },
            existingDaemonIds: new Set(),
        });
        expect(result.success).toBe(false);
    });

    it('auto-ids single exact include', () => {
        const result = resolveDaemonId({
            filter: { include: ['backlog'] },
            existingDaemonIds: new Set(),
        });
        expect(result).toEqual({ success: true, data: 'backlog' });
    });

    it('suffixes when single exact id is taken', () => {
        const result = resolveDaemonId({
            filter: { include: ['backlog'] },
            existingDaemonIds: new Set(['backlog']),
        });
        expect(result).toEqual({ success: true, data: 'backlog-2' });
    });

    it('fails when lump name is reserved global', () => {
        const result = resolveDaemonId({
            filter: { include: ['global'] },
            existingDaemonIds: new Set(),
        });
        expect(result.success).toBe(false);
    });

    it('random-ids multi or glob include', () => {
        const result = resolveDaemonId({
            filter: { include: ['a', 'b'] },
            existingDaemonIds: new Set(),
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/^d-[0-9a-f]{6}$/);
    });

    it('fails when explicit id is in use', () => {
        const result = resolveDaemonId({
            explicitDaemonId: 'agents',
            filter: { include: ['a'] },
            existingDaemonIds: new Set(['agents']),
        });
        expect(result.success).toBe(false);
    });
});
