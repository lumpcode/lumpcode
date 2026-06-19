import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { projectCopiesRootPath } from './main';

describe('projectCopiesRootPath', () => {
    it('places project copies under the global config folder', () => {
        expect(projectCopiesRootPath({ globalConfigFolderPath: '/home/.lumpcode' })).toBe(
            path.join('/home/.lumpcode', 'project-copies'),
        );
    });
});
