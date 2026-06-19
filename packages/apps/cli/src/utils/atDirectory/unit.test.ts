import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { atDirectory } from './main';

function stubPlatform(platform: NodeJS.Platform): void {
    vi.stubGlobal('process', { ...process, platform });
}

describe('atDirectory (posix)', () => {
    beforeEach(() => {
        stubPlatform('linux');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('prefixes a command with cd into the given directory', () => {
        expect(atDirectory('/tmp/workspace', 'git status'))
            .toBe("cd '/tmp/workspace' && git status");
    });

    it('single-quotes directory paths that contain spaces', () => {
        expect(atDirectory('/tmp/my project', 'git fetch'))
            .toBe("cd '/tmp/my project' && git fetch");
    });

    it('escapes single quotes inside the directory path', () => {
        expect(atDirectory("/tmp/o'reilly", 'git switch main'))
            .toBe("cd '/tmp/o'\\''reilly' && git switch main");
    });

    it('leaves the command string unchanged', () => {
        const gitBody = 'git worktree add .lumpcode/worktrees/foo bar';
        expect(atDirectory('/repo', gitBody))
            .toBe(`cd '/repo' && ${gitBody}`);
    });
});

describe('atDirectory (win32)', () => {
    beforeEach(() => {
        stubPlatform('win32');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('uses cd /d for drive-aware directory changes', () => {
        expect(atDirectory('D:\\repo', 'git status'))
            .toBe('cd /d "D:\\repo" && git status');
    });
});
