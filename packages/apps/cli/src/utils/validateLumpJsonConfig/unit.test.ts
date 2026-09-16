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

    it('accepts optional discoveryBranch string', () => {
        const result = validateLumpJsonConfig({
            contextListJson: { FILE: 'src/{FILE}' },
            prompt: { promptTemplate: 'Do {FILE}', command: 'claude' },
            discoveryBranch: 'ver/0.0.9',
        });
        expect(result.success).toBe(true);
    });

    it('rejects non-string discoveryBranch', () => {
        const result = validateLumpJsonConfig({
            contextListJson: { FILE: 'src/{FILE}' },
            prompt: { promptTemplate: 'Do {FILE}', command: 'claude' },
            discoveryBranch: 42,
        });
        expect(result.success).toBe(false);
    });

    describe('post workspace hook fields', () => {
        const base = {
            contextListJson: { FILE: 'src/{FILE}' },
            prompt: { promptTemplate: 'Do {FILE}', command: 'claude' },
        };

        it('accepts postSetupWorkspaceCommand', () => {
            expect(
                validateLumpJsonConfig({ ...base, postSetupWorkspaceCommand: 'npm i' }).success,
            ).toBe(true);
        });

        it('accepts postSetupWorkspaceFn file path', () => {
            expect(
                validateLumpJsonConfig({ ...base, postSetupWorkspaceFn: './postSetup.ts' }).success,
            ).toBe(true);
        });

        it('rejects postSetupWorkspaceFn and postSetupWorkspaceCommand together', () => {
            expect(
                validateLumpJsonConfig({
                    ...base,
                    postSetupWorkspaceFn: './postSetup.ts',
                    postSetupWorkspaceCommand: 'npm i',
                }).success,
            ).toBe(false);
        });

        it('rejects postTeardownWorkspaceFn and postTeardownWorkspaceCommand together', () => {
            expect(
                validateLumpJsonConfig({
                    ...base,
                    postTeardownWorkspaceFn: './postTeardown.ts',
                    postTeardownWorkspaceCommand: 'true',
                }).success,
            ).toBe(false);
        });
    });

    describe('contextListJson shapes', () => {
        const prompt = { promptTemplate: 'Do {FILE}', command: 'claude' };

        it('accepts a static ContextList', () => {
            expect(
                validateLumpJsonConfig({
                    contextListJson: [
                        { name: 'README', variables: { FILE: 'README.md' }, options: { priority: 0 } },
                    ],
                    prompt,
                }).success,
            ).toBe(true);
        });

        it('accepts an empty ContextList and an empty template object', () => {
            expect(validateLumpJsonConfig({ contextListJson: [], prompt }).success).toBe(true);
            expect(validateLumpJsonConfig({ contextListJson: {}, prompt }).success).toBe(true);
        });

        it('rejects a Context with extra keys', () => {
            expect(
                validateLumpJsonConfig({
                    contextListJson: [{ name: 'a', variables: { FILE: 'a.ts' }, extra: 1 }],
                    prompt,
                }).success,
            ).toBe(false);
        });

        it('rejects a bare Context object that is not an array', () => {
            expect(
                validateLumpJsonConfig({
                    contextListJson: { name: 'README', variables: { FILE: 'README.md' } },
                    prompt,
                }).success,
            ).toBe(false);
        });
    });
});
