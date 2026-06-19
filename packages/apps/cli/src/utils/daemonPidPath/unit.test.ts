import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { daemonPidPath } from './main';

describe('daemonPidPath', () => {
    const daemonsDir = '/home/.lumpcode/daemons';

    it('builds the global daemon pid path', () => {
        expect(daemonPidPath({ daemonsDir, projectName: 'demo_proj' })).toBe(
            path.join(daemonsDir, 'demo_proj.daemon.pid'),
        );
    });

    it('builds the per-lump daemon pid path', () => {
        expect(daemonPidPath({ daemonsDir, projectName: 'demo_proj', lumpName: 'alpha' })).toBe(
            path.join(daemonsDir, 'demo_proj.alpha.daemon.pid'),
        );
    });
});
