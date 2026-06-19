import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { LUMP_BRANCH_PREFIX } from '../../consts';
import { contextListBranchSuffix, lumpBranchName } from './main';

describe('contextListBranchSuffix', () => {
    it('uses the single context name when there is one context', () => {
        expect(contextListBranchSuffix([{ name: 'header' }])).toBe('header');
    });

    it('hashes sorted context names when there are multiple contexts', () => {
        const hash = createHash('sha256')
            .update(['alpha', 'beta'].sort().join('\0'))
            .digest('hex')
            .slice(0, 12);
        expect(
            contextListBranchSuffix([{ name: 'beta' }, { name: 'alpha' }]),
        ).toBe(hash);
    });
});

describe('lumpBranchName', () => {
    it('builds a single-context branch name', () => {
        expect(
            lumpBranchName({ lumpName: 'refactor', contextList: [{ name: 'header' }] }),
        ).toBe(`${LUMP_BRANCH_PREFIX}refactor/header`);
    });

    it('builds a multi-context branch name with a hash suffix', () => {
        const hash = contextListBranchSuffix([{ name: 'a' }, { name: 'b' }]);
        expect(
            lumpBranchName({ lumpName: 'refactor', contextList: [{ name: 'a' }, { name: 'b' }] }),
        ).toBe(`${LUMP_BRANCH_PREFIX}refactor/${hash}`);
    });
});
