import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { lumpHistoryFilePath } from './main';

describe('lumpHistoryFilePath', () => {
    it('places history JSON under the lump history directory', () => {
        expect(
            lumpHistoryFilePath({
                projectRoot: '/tmp/project',
                lumpName: 'refactor',
                contextName: 'ctx',
            }),
        ).toBe(path.join('/tmp/project', '.lumpcode', 'lumps', 'refactor', 'history', 'ctx.json'));
    });
});
