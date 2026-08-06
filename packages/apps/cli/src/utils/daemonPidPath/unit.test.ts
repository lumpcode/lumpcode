import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { daemonPidPath, legacyGlobalDaemonPidPath } from './main';

describe('daemonPidPath', () => {
    const daemonsDir = '/home/.lumpcode/daemons';

    it('builds daemon id pid path', () => {
        expect(daemonPidPath({ daemonsDir, projectName: 'demo_proj', daemonId: 'global' })).toBe(
            path.join(daemonsDir, 'demo_proj.global.daemon.pid'),
        );
        expect(daemonPidPath({ daemonsDir, projectName: 'demo_proj', daemonId: 'alpha' })).toBe(
            path.join(daemonsDir, 'demo_proj.alpha.daemon.pid'),
        );
    });

    it('builds legacy bare global pid path', () => {
        expect(legacyGlobalDaemonPidPath({ daemonsDir, projectName: 'demo_proj' })).toBe(
            path.join(daemonsDir, 'demo_proj.daemon.pid'),
        );
    });
});
