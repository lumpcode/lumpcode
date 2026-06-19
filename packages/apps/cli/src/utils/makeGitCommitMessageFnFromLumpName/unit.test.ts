import { describe, expect, it } from 'vitest';

import { LUMP_COMMIT_PREFIX } from '../../consts';
import { makeGitCommitMessageFnFromLumpName } from './main';

describe('makeGitCommitMessageFnFromLumpName', () => {
    const fnInput = { lumpVariables: {}, baseBranch: 'main' };

    it('namespaces commit messages with the current lump for local contexts', () => {
        const fn = makeGitCommitMessageFnFromLumpName('migrate-vue');
        expect(fn({
            context: { name: 'button', variables: {} },
            ...fnInput,
        })).toBe(`${LUMP_COMMIT_PREFIX}migrate-vue - button`);
    });

    it('uses the referenced lump when the context name is lumpName/contextName', () => {
        const fn = makeGitCommitMessageFnFromLumpName('consumer');
        expect(fn({
            context: { name: 'depLump/README', variables: {} },
            ...fnInput,
        })).toBe(`${LUMP_COMMIT_PREFIX}depLump - README`);
    });
});
