import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { shellBestEffort } from './main';

function stubPlatform(platform: NodeJS.Platform): void {
    vi.stubGlobal('process', { ...process, platform });
}

describe('shellBestEffort (posix)', () => {
    beforeEach(() => {
        stubPlatform('linux');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('appends || true', () => {
        expect(shellBestEffort('git branch -D foo')).toBe('git branch -D foo || true');
    });
});

describe('shellBestEffort (win32)', () => {
    beforeEach(() => {
        stubPlatform('win32');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('wraps with (cmd || cd .)', () => {
        expect(shellBestEffort('git branch -D foo')).toBe('(git branch -D foo || cd .)');
    });
});
