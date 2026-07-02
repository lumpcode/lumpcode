import { describe, expect, it } from 'vitest';

import { nodeErrorCode } from './main';

describe('nodeErrorCode', () => {
    it('returns code from Node.js ErrnoException-shaped errors', () => {
        expect(nodeErrorCode(Object.assign(new Error('missing'), { code: 'ENOENT' }))).toBe('ENOENT');
        expect(nodeErrorCode(Object.assign(new Error('exists'), { code: 'EEXIST' }))).toBe('EEXIST');
        expect(nodeErrorCode(Object.assign(new Error('gone'), { code: 'ESRCH' }))).toBe('ESRCH');
    });

    it('returns undefined for non-error values', () => {
        expect(nodeErrorCode(null)).toBeUndefined();
        expect(nodeErrorCode(undefined)).toBeUndefined();
        expect(nodeErrorCode('ENOENT')).toBeUndefined();
        expect(nodeErrorCode({ message: 'no code field' })).toBeUndefined();
    });

    it('returns undefined when code is not a string', () => {
        expect(nodeErrorCode({ code: 404 })).toBeUndefined();
    });
});
