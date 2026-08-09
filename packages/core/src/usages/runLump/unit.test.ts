import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

import type { BranchFn } from '../../types';
import { failure, success } from '../../utils';
import { runLump } from './main';

const stubBranchFn: BranchFn = async () => 'lump/test/ctx';

function initTestGitRepo(projectRoot: string) {
    execSync(
        'git init && git config user.email "test@test.com" && git config user.name "Test" && git commit --allow-empty -m "init"',
        { cwd: projectRoot, stdio: 'pipe' },
    );
}

describe('runLump failure reason preservation (R1/R2)', () => {
    let projectRoot: string;

    beforeEach(async () => {
        projectRoot = await mkdtemp(join(tmpdir(), 'run-lump-reason-'));
        initTestGitRepo(projectRoot);
    });

    afterEach(async () => {
        await rm(projectRoot, { recursive: true, force: true });
    });

    it('R1: propagates stepWalkFailed when rewriting execute-steps message', async () => {
        const result = await runLump({
            projectRoot,
            baseBranch: 'main',
            branchFn: stubBranchFn,
            getContextListFn: async () => [{ name: 'ctx', variables: {} }],
            steps: [{
                commandFn: () => ({
                    executable: 'sh',
                    args: ['-c', 'exit 1'],
                }),
            }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            gitAddCommitFn: () => success('echo git-add-commit'),
            gitPushFn: () => success('echo git-push'),
            gitCommitMessageFn: () => 'LUMP:ctx',
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.message).toMatch(
                /Error in runLump: Failed to execute steps for context list\. Original Error:.*Failed to run the command/i,
            );
            expect((result.data as { reason?: string }).reason).toBe('stepWalkFailed');
        }
    });

    it('R2: propagates workspaceTeardownFailed when rewriting execute-steps message', async () => {
        const result = await runLump({
            projectRoot,
            baseBranch: 'main',
            branchFn: stubBranchFn,
            getContextListFn: async () => [{ name: 'ctx', variables: {} }],
            steps: [{
                commandFn: () => ({ executable: 'echo', args: ['ok'] }),
            }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            gitAddCommitFn: () => success('echo git-add-commit'),
            gitPushFn: () => success('echo git-push'),
            gitCommitMessageFn: () => 'LUMP:ctx',
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => 'exit 1',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.message).toMatch(
                /Error in runLump: Failed to execute steps for context list\. Original Error:.*teardown/i,
            );
            expect((result.data as { reason?: string }).reason).toBe('workspaceTeardownFailed');
        }
    });

    it('R3: propagates gitAddCommitFailed when rewriting execute-steps message', async () => {
        const result = await runLump({
            projectRoot,
            baseBranch: 'main',
            branchFn: stubBranchFn,
            getContextListFn: async () => [{ name: 'ctx', variables: {} }],
            steps: [{
                commandFn: () => ({ executable: 'echo', args: ['ok'] }),
            }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            gitAddCommitFn: () => failure('lock busy'),
            gitPushFn: () => success('echo git-push'),
            gitCommitMessageFn: () => 'LUMP:ctx',
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.message).toMatch(
                /Error in runLump: Failed to execute steps for context list\. Original Error:.*Failed to add and commit for context ctx: lock busy/i,
            );
            expect((result.data as { reason?: string }).reason).toBe('gitAddCommitFailed');
        }
    });
});
