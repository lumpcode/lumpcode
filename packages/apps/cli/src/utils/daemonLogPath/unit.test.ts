import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { daemonLogPath } from './main';

describe('daemonLogPath', () => {
    const daemonsDir = '/home/.lumpcode/daemons';

    it('builds daemon id log path', () => {
        expect(daemonLogPath({ daemonsDir, projectName: 'demo_proj', daemonId: 'global' })).toBe(
            path.join(daemonsDir, 'demo_proj.global.daemon.log'),
        );
        expect(daemonLogPath({ daemonsDir, projectName: 'demo_proj', daemonId: 'alpha' })).toBe(
            path.join(daemonsDir, 'demo_proj.alpha.daemon.log'),
        );
    });
});
