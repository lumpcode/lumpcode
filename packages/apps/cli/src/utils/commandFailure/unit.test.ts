import { describe, it, expect } from 'vitest';
import { failure, success } from '@lumpcode/core';

import { commandFailure, unwrapOrCommandFailure } from './main';

describe('commandFailure', () => {
    it('returns a failure result', () => {
        const result = commandFailure('something went wrong');

        expect(result.success).toBe(false);
    });

    it('wraps the message in a single-item messages array', () => {
        const result = commandFailure('not a lumpcode project');

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');

        expect(result.data).toEqual({ messages: ['not a lumpcode project'] });
    });

    it('preserves the message string as given', () => {
        const message = "path with spaces: /tmp/my project — commit or stash";
        const result = commandFailure(message);

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');

        expect(result.data.messages).toEqual([message]);
    });
});

describe('unwrapOrCommandFailure', () => {
    it('returns success unchanged', () => {
        const result = unwrapOrCommandFailure(success({ ok: true }));

        expect(result).toEqual(success({ ok: true }));
    });

    it('wraps string failures as command output', () => {
        const result = unwrapOrCommandFailure(failure('not a lumpcode project'));

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');

        expect(result.data).toEqual({ messages: ['not a lumpcode project'] });
    });
});
