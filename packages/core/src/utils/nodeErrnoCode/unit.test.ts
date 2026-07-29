import { describe, expect, it } from 'vitest';

import { nodeErrnoCode } from './main';

/** Skipped until kill-spawned-command-on-timeout-abort implementation migrates this util. */
describe('nodeErrnoCode (N1–N3)', () => {
    it('N1: returns string code from Node-style errors', () => {
        const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
        expect(nodeErrnoCode(error)).toBe('ENOENT');
    });

    it('N2: returns undefined when code is not a string', () => {
        const error = Object.assign(new Error('bad'), { code: 1 });
        expect(nodeErrnoCode(error)).toBeUndefined();
    });

    it('N3: returns undefined for errors without code or non-objects', () => {
        expect(nodeErrnoCode(new Error('plain'))).toBeUndefined();
        expect(nodeErrnoCode('ENOENT')).toBeUndefined();
        expect(nodeErrnoCode(null)).toBeUndefined();
    });
});
