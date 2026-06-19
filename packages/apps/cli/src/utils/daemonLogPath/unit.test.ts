import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { daemonLogPath } from './main';

describe('daemonLogPath', () => {
    const daemonsDir = '/home/.lumpcode/daemons';

    it('builds the global daemon log path', () => {
        expect(daemonLogPath({ daemonsDir, projectName: 'demo_proj' })).toBe(
            path.join(daemonsDir, 'demo_proj.daemon.log'),
        );
    });

    it('builds the per-lump daemon log path', () => {
        expect(daemonLogPath({ daemonsDir, projectName: 'demo_proj', lumpName: 'alpha' })).toBe(
            path.join(daemonsDir, 'demo_proj.alpha.daemon.log'),
        );
    });
});
