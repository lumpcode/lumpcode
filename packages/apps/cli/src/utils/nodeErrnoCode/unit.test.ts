import { describe, expect, it } from 'vitest';

import { nodeErrnoCode } from './main';

describe('nodeErrnoCode', () => {
    it('returns string code from Node-style errors', () => {
        const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
        expect(nodeErrnoCode(error)).toBe('ENOENT');
    });

    it('returns undefined when code is not a string', () => {
        const error = Object.assign(new Error('bad'), { code: 1 });
        expect(nodeErrnoCode(error)).toBeUndefined();
    });

    it('returns undefined for errors without code', () => {
        expect(nodeErrnoCode(new Error('plain'))).toBeUndefined();
    });

    it('returns undefined for non-objects', () => {
        expect(nodeErrnoCode('ENOENT')).toBeUndefined();
        expect(nodeErrnoCode(null)).toBeUndefined();
    });
});
