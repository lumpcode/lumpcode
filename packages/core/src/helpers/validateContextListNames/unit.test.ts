import { describe, it, expect } from 'vitest';
import { validateContextListNames } from './main';
import type { Context } from '../../types';

describe('validateContextListNames', () => {
    it('returns an error for names with spaces or special characters', () => {
        const error = validateContextListNames([
            { name: 'valid-name', variables: {} },
            { name: 'bad name', variables: {} },
            { name: 'bad@name', variables: {} },
        ]);

        expect(error).toContain('Invalid context name(s): bad name, bad@name');
    });

    it('returns an error for duplicate names', () => {
        const error = validateContextListNames([
            { name: 'alpha', variables: {} },
            { name: 'beta', variables: {} },
            { name: 'alpha', variables: {} },
        ]);

        expect(error).toContain('Duplicate context name(s): alpha');
    });

    it('returns undefined for valid unique names', () => {
        const contextList: Context[] = [
            { name: 'Context_1', variables: {} },
            { name: 'context-2', variables: {} },
        ];

        expect(validateContextListNames(contextList)).toBeUndefined();
    });
});
