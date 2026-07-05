import { describe, expect, it } from 'vitest';
import { failure, success } from '@lumpcode/core';

import { toCommandResult } from './main';

describe('toCommandResult', () => {
    it('passes through success results unchanged', () => {
        const result = toCommandResult(success({ mode: 'shared' as const }));

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data).toEqual({ mode: 'shared' });
    });

    it('wraps string failures as command output failures', () => {
        const result = toCommandResult(failure('not a lumpcode project'));

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');

        expect(result.data).toEqual({ messages: ['not a lumpcode project'] });
    });
});
