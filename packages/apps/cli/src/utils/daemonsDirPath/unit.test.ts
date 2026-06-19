import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { daemonsDirPath } from './main';

describe('daemonsDirPath', () => {
    it('places daemon files under the global config folder', () => {
        expect(daemonsDirPath({ globalConfigFolderPath: '/home/.lumpcode' })).toBe(
            path.join('/home/.lumpcode', 'daemons'),
        );
    });
});
