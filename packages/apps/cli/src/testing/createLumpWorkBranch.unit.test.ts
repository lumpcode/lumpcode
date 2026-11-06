import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createLumpWorkBranch } from './createLumpWorkBranch';
import {
    createTempTestDirs,
    execGit,
    getGitCommitMessage,
    initBareRemoteAndCheckout,
    removeTempTestDirs,
} from '../utils';

describe('createLumpWorkBranch', () => {
    let projectRoot: string;
    let remoteDir: string;

    beforeEach(async () => {
        ({ projectRoot, remoteDir } = await createTempTestDirs({
            prefix: 'lump-work-branch-',
            global: false,
        }));
        initBareRemoteAndCheckout({ projectRoot, remoteDir });
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, remoteDir });
    });

    function head(): string {
        return execGit('rev-parse --abbrev-ref HEAD', projectRoot);
    }

    function subjectOf(branch: string): string {
        return execGit(`log -1 --format=%s ${branch}`, projectRoot);
    }

    function bodyOf(branch: string): string {
        return execGit(`log -1 --format=%b ${branch}`, projectRoot);
    }

    function changedPaths(branch: string): string {
        return execGit(`diff-tree --no-commit-id --name-only -r ${branch}`, projectRoot);
    }

    function remoteHeads(): string {
        return execGit('ls-remote --heads origin', projectRoot);
    }

    it('creates an empty lump branch, pushes it, and returns to main', () => {
        const branch = createLumpWorkBranch({
            projectRoot,
            lumpName: 'my-lump',
            contextName: 'ctx-a',
        });

        expect(branch).toBe('lump/my-lump/ctx-a');
        expect(head()).toBe('main');
        expect(subjectOf(branch)).toBe('lump work');
        expect(bodyOf(branch)).toBe('');
        expect(changedPaths(branch)).toBe('');
        expect(remoteHeads()).toContain(`refs/heads/${branch}`);
    });

    it('does not push when push is false', () => {
        const branch = createLumpWorkBranch({
            projectRoot,
            lumpName: 'my-lump',
            contextName: 'local-ctx',
            push: false,
        });

        expect(head()).toBe('main');
        expect(execGit('branch --list', projectRoot)).toContain(branch);
        expect(remoteHeads()).not.toContain(`refs/heads/${branch}`);
    });

    it('leaves HEAD on the new branch when checkoutMain is false', () => {
        const branch = createLumpWorkBranch({
            projectRoot,
            lumpName: 'my-lump',
            contextName: 'stay',
            checkoutMain: false,
        });

        expect(head()).toBe(branch);
        expect(remoteHeads()).toContain(`refs/heads/${branch}`);
    });

    it('uses the lump marker subject when useMarkerMessage is true', () => {
        const branch = createLumpWorkBranch({
            projectRoot,
            lumpName: 'myLump',
            contextName: 'button',
            message: 'ignored',
            useMarkerMessage: true,
        });

        expect(subjectOf(branch)).toBe(getGitCommitMessage({ lumpName: 'myLump', contextName: 'button' }));
    });

    it('records a custom subject and body', () => {
        const commitBody = '* LUMP: myLump - button, LUMP: myLump - form';
        const branch = createLumpWorkBranch({
            projectRoot,
            lumpName: 'myLump',
            contextName: 'batch',
            message: 'PR title',
            commitBody,
        });

        expect(branch).toBe('lump/myLump/batch');
        expect(subjectOf(branch)).toBe('PR title');
        expect(bodyOf(branch)).toBe(commitBody);
        expect(changedPaths(branch)).toBe('');
    });
});
