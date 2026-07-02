import { describe, it, expect } from 'vitest';
import { failure, success } from '@lumpcode/core';

import { commandFailure, orCommandFailure } from './main';

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

describe('orCommandFailure', () => {
    it('passes success through unchanged', () => {
        const inner = success({ value: 42 });
        const result = orCommandFailure(inner);

        expect(result).toBe(inner);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({ value: 42 });
    });

    it('maps string failure to command failure envelope', () => {
        const inner = failure('missing config');
        const result = orCommandFailure(inner);

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toEqual({ messages: ['missing config'] });
    });
});
