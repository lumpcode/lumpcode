import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { contextStatusRecordPath } from './main';

describe('contextStatusRecordPath', () => {
    it('places the record under .lumpcode/lumps/<lumpName>', () => {
        const projectRoot = '/home/user/my-project';
        const lumpName = 'migrateVue';

        expect(contextStatusRecordPath({ projectRoot, lumpName })).toBe(
            path.join(projectRoot, '.lumpcode', 'lumps', lumpName, 'contextStatusRecord.json'),
        );
    });

    it('keeps lump names with hyphens as a single path segment', () => {
        const projectRoot = '/repo';
        const lumpName = 'react-to-vue';

        expect(contextStatusRecordPath({ projectRoot, lumpName })).toBe(
            path.join(projectRoot, '.lumpcode', 'lumps', 'react-to-vue', 'contextStatusRecord.json'),
        );
    });
});
