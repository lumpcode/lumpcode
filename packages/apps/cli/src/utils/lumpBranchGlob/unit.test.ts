import { describe, expect, it } from 'vitest';

import { LUMP_BRANCH_PREFIX } from '../../consts';
import { lumpBranchGlob } from './main';

describe('lumpBranchGlob', () => {
    it('returns the all-lumps glob when lumpName is omitted', () => {
        expect(lumpBranchGlob()).toBe(`${LUMP_BRANCH_PREFIX}*`);
    });

    it('returns a per-lump glob when lumpName is set', () => {
        expect(lumpBranchGlob({ lumpName: 'alpha' })).toBe(`${LUMP_BRANCH_PREFIX}alpha/*`);
    });
});
