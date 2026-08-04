import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { daemonMetaPath } from './main';

describe('daemonMetaPath', () => {
    const daemonsDir = '/home/.lumpcode/daemons';

    it('builds daemon id meta path', () => {
        expect(daemonMetaPath({ daemonsDir, projectName: 'demo_proj', daemonId: 'global' })).toBe(
            path.join(daemonsDir, 'demo_proj.global.daemon.meta.json'),
        );
        expect(daemonMetaPath({ daemonsDir, projectName: 'demo_proj', daemonId: 'alpha' })).toBe(
            path.join(daemonsDir, 'demo_proj.alpha.daemon.meta.json'),
        );
    });
});
