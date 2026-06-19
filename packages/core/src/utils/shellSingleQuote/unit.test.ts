import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shellSingleQuote } from './main';

function stubPlatform(platform: NodeJS.Platform): void {
    vi.stubGlobal('process', { ...process, platform });
}

describe('shellSingleQuote (posix)', () => {
    beforeEach(() => {
        stubPlatform('linux');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('wraps plain strings in single quotes', () => {
        expect(shellSingleQuote('hello')).toBe(`'hello'`);
    });

    it('wraps strings with spaces', () => {
        expect(shellSingleQuote('LUMP: myLump - button')).toBe(`'LUMP: myLump - button'`);
    });

    it('escapes embedded single quotes using the close/escape/reopen pattern', () => {
        expect(shellSingleQuote("it's fine")).toBe(`'it'\\''s fine'`);
    });

    it('neutralizes shell-sensitive characters inside quotes', () => {
        expect(shellSingleQuote('$(whoami)')).toBe(`'$(whoami)'`);
        expect(shellSingleQuote('`cat /etc/passwd`')).toBe(`'\`cat /etc/passwd\`'`);
        expect(shellSingleQuote('* ; rm -rf /')).toBe(`'* ; rm -rf /'`);
    });

    it('handles empty strings', () => {
        expect(shellSingleQuote('')).toBe(`''`);
    });
});

describe('shellSingleQuote (win32)', () => {
    beforeEach(() => {
        stubPlatform('win32');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('wraps strings in double quotes for cmd.exe', () => {
        expect(shellSingleQuote('LUMP: myLump - ')).toBe(`"LUMP: myLump - "`);
    });

    it('escapes embedded double quotes as ""', () => {
        expect(shellSingleQuote('say "hi"')).toBe(`"say ""hi"""`);
    });

    it('handles empty strings', () => {
        expect(shellSingleQuote('')).toBe(`""`);
    });
});
