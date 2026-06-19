import { describe, it, expect } from 'vitest';

import { validateLumpJsonConfig } from './main';

describe('validateLumpJsonConfig', () => {
    it('accepts a minimal valid config', () => {
        const result = validateLumpJsonConfig({
            contextListJson: { FILE: 'src/{FILE}' },
            prompt: { promptTemplate: 'Do {FILE}', command: 'claude' },
        });
        expect(result.success).toBe(true);
    });

    it('rejects config with both contextListJson and getContextListFn', () => {
        const result = validateLumpJsonConfig({
            contextListJson: { FILE: 'a' },
            getContextListFn: './fn.js',
            prompt: { promptTemplate: 'x', command: 'claude' },
        });
        expect(result.success).toBe(false);
    });

    it('rejects config with neither prompt nor steps', () => {
        const result = validateLumpJsonConfig({
            contextListJson: { FILE: 'a' },
        });
        expect(result.success).toBe(false);
    });

    it('accepts a step with command only and no prompt fields', () => {
        const result = validateLumpJsonConfig({
            contextListJson: { FILE: 'src/{FILE}' },
            command: 'claude',
            steps: [{ command: 'claude' }],
        });
        expect(result.success).toBe(true);
    });
});
