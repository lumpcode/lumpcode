import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { lumpDirPath, lumpImportBasePath, lumpsDirPath } from './main';

describe('lumpDirPath', () => {
    const localConfigFolderPath = '/repo/.lumpcode';

    it('places lumps under the local config folder', () => {
        expect(lumpsDirPath({ localConfigFolderPath })).toBe(path.join(localConfigFolderPath, 'lumps'));
    });

    it('places a lump directory under lumps/<lumpName>', () => {
        expect(lumpDirPath({ localConfigFolderPath, lumpName: 'migrate-vue' })).toBe(
            path.join(localConfigFolderPath, 'lumps', 'migrate-vue'),
        );
    });

    it('exposes lumpImportBasePath as an alias for lumpDirPath', () => {
        const input = { localConfigFolderPath, lumpName: 'alpha' };
        expect(lumpImportBasePath(input)).toBe(lumpDirPath(input));
    });
});
