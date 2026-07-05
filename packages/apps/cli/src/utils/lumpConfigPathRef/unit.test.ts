import { describe, expect, it } from 'vitest';

import { isCommandFileRef, isPromptTemplateFileRef } from './main';

describe('lumpConfigPathRef', () => {
    describe('isPromptTemplateFileRef', () => {
        it('returns true for path-like template files without whitespace', () => {
            expect(isPromptTemplateFileRef('./prompts/refactor.md')).toBe(true);
            expect(isPromptTemplateFileRef('prompts/readme.md')).toBe(true);
            expect(isPromptTemplateFileRef('notes.txt')).toBe(true);
        });

        it('returns false for inline prompt text', () => {
            expect(isPromptTemplateFileRef('Fix @{FILE}')).toBe(false);
            expect(isPromptTemplateFileRef('Add a section to prompts/readme.md')).toBe(false);
            expect(isPromptTemplateFileRef('readme')).toBe(false);
        });
    });

    describe('isCommandFileRef', () => {
        it('returns true for command module paths without whitespace', () => {
            expect(isCommandFileRef('./agents/custom.ts')).toBe(true);
            expect(isCommandFileRef('agents/custom.js')).toBe(true);
        });

        it('returns false for command tags', () => {
            expect(isCommandFileRef('cursor')).toBe(false);
            expect(isCommandFileRef('my-agent')).toBe(false);
        });
    });
});
