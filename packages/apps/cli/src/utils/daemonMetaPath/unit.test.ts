import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { daemonMetaPath } from './main';

describe('daemonMetaPath', () => {
    const daemonsDir = '/home/.lumpcode/daemons';

    it('builds the global daemon meta path', () => {
        expect(daemonMetaPath({ daemonsDir, projectName: 'demo_proj' })).toBe(
            path.join(daemonsDir, 'demo_proj.daemon.meta.json'),
        );
    });

    it('builds the per-lump daemon meta path', () => {
        expect(daemonMetaPath({ daemonsDir, projectName: 'demo_proj', lumpName: 'alpha' })).toBe(
            path.join(daemonsDir, 'demo_proj.alpha.daemon.meta.json'),
        );
    });
});
