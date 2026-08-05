import { describe, expect, it } from 'vitest';

import { daemonFileBaseName, legacyGlobalDaemonFileBaseName, RESERVED_DAEMON_ID } from './main';

describe('daemonFileBaseName', () => {
    it('uses projectName.daemonId', () => {
        expect(daemonFileBaseName({ projectName: 'demo_proj', daemonId: RESERVED_DAEMON_ID })).toBe(
            'demo_proj.global',
        );
        expect(daemonFileBaseName({ projectName: 'demo_proj', daemonId: 'alpha' })).toBe(
            'demo_proj.alpha',
        );
    });

    it('exposes legacy bare basename', () => {
        expect(legacyGlobalDaemonFileBaseName('demo_proj')).toBe('demo_proj');
    });
});
