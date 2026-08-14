import { describe, expect, it } from 'vitest';

import { contextNamesAfterLumpPrefix } from './main';

const lumpPrefix = 'LUMP: myLump - ';

describe('contextNamesAfterLumpPrefix', () => {
    it('extracts a context name from an exact marker subject', () => {
        expect(contextNamesAfterLumpPrefix('LUMP: myLump - button', lumpPrefix)).toEqual(['button']);
    });

    it('extracts names from GitHub-style bullets and concatenation', () => {
        const message = [
            'PR title',
            '',
            '* LUMP: myLump - foo',
            'LUMP: myLump - bar, LUMP: myLump - baz',
        ].join('\n');
        expect(contextNamesAfterLumpPrefix(message, lumpPrefix)).toEqual(['foo', 'bar', 'baz']);
    });

    it('does not emit a prefix of a longer context name', () => {
        expect(contextNamesAfterLumpPrefix('LUMP: myLump - foo-bar', lumpPrefix)).toEqual(['foo-bar']);
    });

    it('ignores other lumps', () => {
        expect(contextNamesAfterLumpPrefix('LUMP: otherLump - form', lumpPrefix)).toEqual([]);
    });

    it('returns an empty array when the prefix is empty or absent', () => {
        expect(contextNamesAfterLumpPrefix('LUMP: myLump - button', '')).toEqual([]);
        expect(contextNamesAfterLumpPrefix('', lumpPrefix)).toEqual([]);
    });
});
