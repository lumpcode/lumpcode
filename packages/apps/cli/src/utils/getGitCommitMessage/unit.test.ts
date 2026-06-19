import { describe, it, expect } from 'vitest';
import { getGitCommitMessage, getLumpCommitPrefixForLump } from './main';
import { LUMP_COMMIT_PREFIX } from '../../consts';

describe('getGitCommitMessage', () => {
    it('builds a normalized message from lumpName and contextName', () => {
        expect(getGitCommitMessage({ contextName: 'button', lumpName: 'reactToVue' }))
            .toBe(`${LUMP_COMMIT_PREFIX}reactToVue - button`);
    });

    it('handles context names containing slashes', () => {
        expect(getGitCommitMessage({ contextName: 'components/button', lumpName: 'migrate' }))
            .toBe(`${LUMP_COMMIT_PREFIX}migrate - components/button`);
    });

    it('handles lump names containing hyphens', () => {
        expect(getGitCommitMessage({ contextName: 'form', lumpName: 'react-to-vue' }))
            .toBe(`${LUMP_COMMIT_PREFIX}react-to-vue - form`);
    });
});

describe('getLumpCommitPrefixForLump', () => {
    it('returns the per-lump prefix used to scope grep queries', () => {
        expect(getLumpCommitPrefixForLump({ lumpName: 'reactToVue' }))
            .toBe(`${LUMP_COMMIT_PREFIX}reactToVue - `);
    });
});
