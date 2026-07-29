import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

import type { BranchFn, CommandDescriptor } from '../../types';
import {
    probeAlive,
    waitForPidGone,
    waitForReadyFile,
} from '../../testing/processTreeTestHelpers';
import { executeStepsForContextList } from './main';

const stubBranchFn: BranchFn = async () => 'lump/test/ctx';
const stubGitAdd = () => 'echo git-add';
const stubGitCommit = () => 'echo git-commit';
const stubGitPush = () => 'echo git-push';
const stubGitCommitMessage = () => 'LUMP:ctx';

function initTestGitRepo(projectRoot: string) {
    execSync(
        'git init && git config user.email "test@test.com" && git config user.name "Test" && git commit --allow-empty -m "init"',
        { cwd: projectRoot, stdio: 'pipe' },
    );
}

function longLivedCommand(readyFile: string): CommandDescriptor {
    const script = `
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(readyFile)}, JSON.stringify({ pids: [process.pid] }) + '\\n');
setInterval(() => {}, 60_000);
`;
    return {
        executable: process.execPath,
        args: ['-e', script],
    };
}

/** Skipped until kill-spawned-command-on-timeout-abort implementation lands. */
describe.skip('executeStepsForContextList timeout/abort (S1–S5)', () => {
    let projectRoot: string;
    const activePids = new Set<number>();

    beforeEach(async () => {
        projectRoot = await mkdtemp(join(tmpdir(), 'steps-timeout-abort-'));
        initTestGitRepo(projectRoot);
    });

    afterEach(async () => {
        for (const pid of activePids) {
            try {
                process.kill(pid, 'SIGKILL');
            } catch {
                // already gone
            }
        }
        activePids.clear();
        await rm(projectRoot, { recursive: true, force: true });
    });

    it('S1: timeout + continueOnError continues; tree is dead', async () => {
        const readyFile = join(projectRoot, 'ready.json');
        const executionOrder: string[] = [];

        const resultPromise = executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [
                {
                    continueOnError: true,
                    timeoutMillis: 80,
                    commandFn: () => longLivedCommand(readyFile),
                    postCommandExecFn: () => {
                        executionOrder.push('post-timeout');
                    },
                },
                {
                    commandFn: () => {
                        executionOrder.push('step-2');
                        return { executable: 'echo', args: ['reached'] };
                    },
                    postCommandExecFn: () => {
                        executionOrder.push('post-2');
                    },
                },
            ],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        const { pids } = await waitForReadyFile(readyFile);
        for (const pid of pids) activePids.add(pid);

        const result = await resultPromise;
        expect(result.success).toBe(true);
        expect(executionOrder).toEqual(['post-timeout', 'step-2', 'post-2']);

        for (const pid of pids) {
            await waitForPidGone(pid);
            expect(probeAlive(pid)).toBe(false);
            activePids.delete(pid);
        }
    });

    it('S2: timeout without continueOnError stops the walk; tree is dead', async () => {
        const readyFile = join(projectRoot, 'ready-stop.json');
        const executionOrder: string[] = [];

        const resultPromise = executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [
                {
                    timeoutMillis: 80,
                    commandFn: () => longLivedCommand(readyFile),
                },
                {
                    commandFn: () => {
                        executionOrder.push('step-2');
                        return { executable: 'echo', args: ['never'] };
                    },
                },
            ],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        const { pids } = await waitForReadyFile(readyFile);
        for (const pid of pids) activePids.add(pid);

        const result = await resultPromise;
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.message).toMatch(/timed out|Failed to run the command/i);
        }
        expect(executionOrder).toEqual([]);

        for (const pid of pids) {
            await waitForPidGone(pid);
            expect(probeAlive(pid)).toBe(false);
            activePids.delete(pid);
        }
    });

    it('S3: abort + continueOnError still stops the walk; tree is dead', async () => {
        const readyFile = join(projectRoot, 'ready-abort.json');
        const executionOrder: string[] = [];
        const controller = new AbortController();

        const resultPromise = executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            signal: controller.signal,
            steps: [
                {
                    continueOnError: true,
                    commandFn: () => longLivedCommand(readyFile),
                },
                {
                    commandFn: () => {
                        executionOrder.push('step-2');
                        return { executable: 'echo', args: ['never'] };
                    },
                },
            ],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        const { pids } = await waitForReadyFile(readyFile);
        for (const pid of pids) activePids.add(pid);
        controller.abort();

        const result = await resultPromise;
        expect(result.success).toBe(false);
        expect(executionOrder).toEqual([]);

        for (const pid of pids) {
            await waitForPidGone(pid);
            expect(probeAlive(pid)).toBe(false);
            activePids.delete(pid);
        }
    });

    it('S4: already-aborted signal fails without orphans and ignores continueOnError', async () => {
        const controller = new AbortController();
        controller.abort();
        const executionOrder: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            signal: controller.signal,
            steps: [
                {
                    continueOnError: true,
                    commandFn: () => {
                        executionOrder.push('step-1');
                        return { executable: 'echo', args: ['should-not-matter'] };
                    },
                },
            ],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(false);
    });

    it('S5: exit + continueOnError regression still succeeds', async () => {
        const executionOrder: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [{
                continueOnError: true,
                commandFn: () => ({
                    executable: 'sh',
                    args: ['-c', 'echo verification failed; exit 1'],
                }),
                postCommandExecFn: ({ commandResult, commandSucceeded, contextRunState }) => {
                    executionOrder.push(`post:${commandResult.includes('verification failed')}`);
                    executionOrder.push(`succeeded:${commandSucceeded}`);
                    contextRunState.valid = false;
                },
            }, ({ contextRunState }) => {
                executionOrder.push(`dynamic:${contextRunState.valid === false}`);
                return [];
            }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(true);
        expect(executionOrder).toEqual(['post:true', 'succeeded:false', 'dynamic:true']);
    });
});
