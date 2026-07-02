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
    it('returns success results unchanged', () => {
        const inner = success({ lumpName: 'my-lump' });
        const result = unwrapOrCommandFailure(inner);

        expect(result).toBe(inner);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({ lumpName: 'my-lump' });
    });

    it('wraps string failures as command output', () => {
        const inner = failure('not a lumpcode project');
        const result = unwrapOrCommandFailure(inner);

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toEqual({ messages: ['not a lumpcode project'] });
    });
});
