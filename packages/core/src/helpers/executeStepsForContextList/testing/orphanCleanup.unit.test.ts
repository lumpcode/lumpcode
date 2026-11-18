import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { Logger, Step } from '../../../types';
import {
    isRunning,
    orphanLeavingShellArgs,
    waitForReadyFile,
} from '../../../testing/processTreeTestHelpers';
import { executeStepsForContextList } from '../main';
import {
    initTestGitRepo,
    stubBranchFn,
    stubGitAddCommit,
    stubGitCommitMessage,
    stubGitPush,
} from './testHelpers';


function warnCapturingLogger(warnings: string[]): Logger {
    const logger: Logger = {
        error: () => {},
        warn: (message) => {
            warnings.push(message);
        },
        info: () => {},
        verbose: () => {},
        child: () => logger,
    };
    return logger;
}

describe('executeStepsForContextList leftover processes', () => {
    let projectRoot: string;
    const activePids = new Set<number>();

    beforeEach(async () => {
        projectRoot = await mkdtemp(join(tmpdir(), 'steps-orphans-'));
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

    function runSingleStep(input: { step: Step; signal?: AbortSignal; logger?: Logger }) {
        const { step, signal, logger } = input;
        return executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommitFn: stubGitAddCommit,
            gitPushFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [step],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
            lumpName: 'orphans',
            ...(signal ? { signal } : {}),
            ...(logger ? { logger } : {}),
        });
    }

    describe.skipIf(process.platform === 'win32')('in a systemd scope or its own process group', () => {
        it.each([
            { outcome: 'succeeds', tail: 'exit 0', walkSucceeds: true },
            { outcome: 'fails', tail: 'exit 3', walkSucceeds: false },
        ])('kills a background orphan once the step $outcome', async ({ tail, walkSucceeds }) => {
            const readyFile = join(projectRoot, 'ready.json');
            const resultPromise = runSingleStep({
                step: {
                    timeoutMillis: 60_000,
                    commandFn: () => ({
                        executable: 'sh',
                        args: orphanLeavingShellArgs({ readyFile, tail }),
                    }),
                },
            });

            const { pids } = await waitForReadyFile(readyFile);
            for (const pid of pids) activePids.add(pid);

            const result = await resultPromise;
            expect(result.success).toBe(walkSucceeds);
            for (const pid of pids) {
                expect(await isRunning(pid)).toBe(false);
            }
        });

        it('kills a background orphan when the step is aborted', async () => {
            const readyFile = join(projectRoot, 'ready-abort.json');
            const controller = new AbortController();
            const resultPromise = runSingleStep({
                step: {
                    timeoutMillis: 60_000,
                    commandFn: () => ({
                        executable: 'sh',
                        args: orphanLeavingShellArgs({ readyFile, tail: 'sleep 60' }),
                    }),
                },
                signal: controller.signal,
            });

            const { pids } = await waitForReadyFile(readyFile);
            for (const pid of pids) activePids.add(pid);
            controller.abort();

            const result = await resultPromise;
            expect(result.success).toBe(false);
            for (const pid of pids) {
                expect(await isRunning(pid)).toBe(false);
            }
        });
    });

    it.skipIf(process.platform === 'win32')('logs the signal that killed the step command', async () => {
        const warnings: string[] = [];
        const result = await runSingleStep({
            step: {
                commandFn: () => ({
                    executable: process.execPath,
                    args: ['-e', 'process.kill(process.pid, "SIGTERM")'],
                }),
            },
            logger: warnCapturingLogger(warnings),
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.message).toContain('Process exited by signal SIGTERM');
        }
        expect(warnings).toContain('Step 0 command exited by signal SIGTERM');
    });
});
