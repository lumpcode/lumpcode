import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { localConfigFolderPath } from './main';

describe('localConfigFolderPath', () => {
    it('places config under .lumpcode at the project root', () => {
        expect(localConfigFolderPath({ projectRoot: '/home/user/repo' })).toBe(
            path.join('/home/user/repo', '.lumpcode'),
        );
    });
});
