import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { CommandDescriptor } from '../../../types';
import {
    probeAlive,
    waitForPidGone,
    waitForReadyFile,
} from '../../../testing/processTreeTestHelpers';
import { executeStepsForContextList } from '../main';
import {
    initTestGitRepo,
    recordingTeardownAndGit,
    stubBranchFn,
    stubGitAdd,
    stubGitCommit,
    stubGitCommitMessage,
    stubGitPush,
} from './testHelpers';

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

describe('executeStepsForContextList timeout/abort (S1–S5)', () => {
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
                    timeoutMillis: 2000,
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
        const events: string[] = [];

        const resultPromise = executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            ...recordingTeardownAndGit(events),
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [
                {
                    timeoutMillis: 2000,
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
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            getKeepHistoryFilePathFn: () => undefined,
        });

        const { pids } = await waitForReadyFile(readyFile);
        for (const pid of pids) activePids.add(pid);

        const result = await resultPromise;
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.message).toMatch(/timed out|Failed to run the command/i);
            expect((result.data as { reason?: string }).reason).toBe('stepWalkFailed');
        }
        expect(executionOrder).toEqual([]);
        expect(events).toEqual(['teardownFn', 'teardownWorkspaceFn']);

        for (const pid of pids) {
            await waitForPidGone(pid);
            expect(probeAlive(pid)).toBe(false);
            activePids.delete(pid);
        }
    });

    it('S3: abort + continueOnError still stops the walk; tree is dead', async () => {
        const readyFile = join(projectRoot, 'ready-abort.json');
        const executionOrder: string[] = [];
        const events: string[] = [];
        const controller = new AbortController();

        const resultPromise = executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            ...recordingTeardownAndGit(events),
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
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            getKeepHistoryFilePathFn: () => undefined,
        });

        const { pids } = await waitForReadyFile(readyFile);
        for (const pid of pids) activePids.add(pid);
        controller.abort();

        const result = await resultPromise;
        expect(result.success).toBe(false);
        if (!result.success) {
            expect((result.data as { reason?: string }).reason).toBe('stepWalkFailed');
        }
        expect(executionOrder).toEqual([]);
        expect(events).toEqual(['teardownFn', 'teardownWorkspaceFn']);

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
        const events: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            ...recordingTeardownAndGit(events),
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
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect((result.data as { reason?: string }).reason).toBe('stepWalkFailed');
        }
        expect(events).toEqual(['teardownFn', 'teardownWorkspaceFn']);
        expect(events).not.toContain('gitAdd');
        expect(events).not.toContain('gitPush');
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
