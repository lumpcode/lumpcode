import { describe, expect, it } from 'vitest';

import { assertValidLumpName, isValidLumpName } from './main';

describe('isValidLumpName', () => {
    it('accepts a simple lump name', () => {
        expect(isValidLumpName('add-tests')).toBe(true);
    });

    it('rejects empty names', () => {
        expect(isValidLumpName('')).toBe(false);
        expect(isValidLumpName('   ')).toBe(false);
    });

    it('rejects path separators and reserved names', () => {
        expect(isValidLumpName('a/b')).toBe(false);
        expect(isValidLumpName('.')).toBe(false);
        expect(isValidLumpName('..')).toBe(false);
    });
});

describe('assertValidLumpName', () => {
    it('returns ok for valid names', () => {
        expect(assertValidLumpName('my-lump')).toEqual({ ok: true });
    });

    it('returns a message for invalid names', () => {
        expect(assertValidLumpName(' bad')).toEqual({
            ok: false,
            message: 'Lump name must not have leading or trailing whitespace',
        });
    });
});
