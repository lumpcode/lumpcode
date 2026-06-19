import { describe, it, expect } from 'vitest';
import { defineConfig } from './main';

describe('defineConfig', () => {
    it('returns the same config object', () => {
        const config = { baseBranch: 'main', maximumNumberOfConcurrentBranches: 2 };

        expect(defineConfig(config)).toBe(config);
    });

    it('preserves every field on the config', () => {
        const config = {
            baseBranch: 'develop',
            keepHistory: true,
            registerCommands: ['claude', 'aider'],
            maximumNumberOfConcurrentBranches: 4,
        };

        expect(defineConfig(config)).toEqual(config);
    });
});
