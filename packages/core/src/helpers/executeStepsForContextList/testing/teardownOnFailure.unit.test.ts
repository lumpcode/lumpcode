import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { success } from '../../../utils';
import { executeStepsForContextList } from '../main';
import {
    capturingLogger,
    initTestGitRepo,
    makeSteps,
    recordingGitFns,
    stubBranchFn,
    stubGitCommitMessage,
} from './testHelpers';

describe('executeStepsForContextList teardown on failure (F/W/G/O/M)', () => {
    let projectRoot: string;

    beforeEach(async () => {
        projectRoot = await mkdtemp(join(tmpdir(), 'teardown-on-failure-'));
        initTestGitRepo(projectRoot);
    });

    afterEach(async () => {
        await rm(projectRoot, { recursive: true, force: true });
    });

    it('F1: teardownFn throws on success path — logged, git and workspace teardown still run', async () => {
        const events: string[] = [];
        const errorCalls: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            ...recordingGitFns(events),
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: makeSteps(['ok']),
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => {
                events.push('teardownFn');
                throw new Error('teardown boom');
            },
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => {
                events.push('teardownWorkspaceFn');
                return '';
            },
            getKeepHistoryFilePathFn: () => undefined,
            logger: capturingLogger(errorCalls),
        });

        expect(result.success).toBe(true);
        expect(events).toEqual(['teardownFn', 'gitAddCommit', 'gitPush', 'teardownWorkspaceFn']);
        expect(errorCalls.some((message) => /teardown/i.test(message) && /boom/i.test(message))).toBe(true);
    });

    it('F2: teardownFn throws after step-walk failure — reason stays stepWalkFailed', async () => {
        const events: string[] = [];
        const errorCalls: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            ...recordingGitFns(events),
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [{
                commandFn: () => ({
                    executable: 'sh',
                    args: ['-c', 'exit 1'],
                }),
            }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => {
                events.push('teardownFn');
                throw new Error('teardown boom');
            },
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => {
                events.push('teardownWorkspaceFn');
                return '';
            },
            getKeepHistoryFilePathFn: () => undefined,
            logger: capturingLogger(errorCalls),
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect((result.data as { reason?: string }).reason).toBe('stepWalkFailed');
        }
        expect(events).toEqual(['teardownFn', 'teardownWorkspaceFn']);
        expect(errorCalls.some((message) => /teardown/i.test(message) && /boom/i.test(message))).toBe(true);
    });

    it('W1: success walk + failing workspace teardown → workspaceTeardownFailed after push', async () => {
        const events: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            ...recordingGitFns(events),
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: makeSteps(['ok']),
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => {
                events.push('teardownFn');
            },
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => {
                events.push('teardownWorkspaceFn');
                return 'exit 1';
            },
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.message).toMatch(/teardown/i);
            expect((result.data as { reason?: string }).reason).toBe('workspaceTeardownFailed');
        }
        expect(events).toEqual(['teardownFn', 'gitAddCommit', 'gitPush', 'teardownWorkspaceFn']);
    });

    it('W2: step-walk failed then workspace teardown also fails — reason stays stepWalkFailed', async () => {
        const events: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            ...recordingGitFns(events),
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [{
                commandFn: () => ({
                    executable: 'sh',
                    args: ['-c', 'exit 1'],
                }),
            }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => {
                events.push('teardownFn');
            },
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => {
                events.push('teardownWorkspaceFn');
                return 'exit 1';
            },
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect((result.data as { reason?: string }).reason).toBe('stepWalkFailed');
        }
        expect(events).toEqual(['teardownFn', 'teardownWorkspaceFn']);
        expect(events).not.toContain('gitPush');
    });

    it('W3: soft teardownFn error + failing workspace teardown → workspaceTeardownFailed', async () => {
        const events: string[] = [];
        const errorCalls: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            ...recordingGitFns(events),
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: makeSteps(['ok']),
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => {
                events.push('teardownFn');
                throw new Error('teardown boom');
            },
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => {
                events.push('teardownWorkspaceFn');
                return 'exit 1';
            },
            getKeepHistoryFilePathFn: () => undefined,
            logger: capturingLogger(errorCalls),
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect((result.data as { reason?: string }).reason).toBe('workspaceTeardownFailed');
        }
        expect(events).toEqual(['teardownFn', 'gitAddCommit', 'gitPush', 'teardownWorkspaceFn']);
        expect(errorCalls.some((message) => /teardown/i.test(message) && /boom/i.test(message))).toBe(true);
    });

    it('G1: git add+commit failure after successful walk still runs teardownWorkspaceFn', async () => {
        const events: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommitFn: () => {
                events.push('gitAddCommit');
                return success('exit 1');
            },
            gitPushFn: () => {
                events.push('gitPush');
                return success('echo git-push');
            },
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: makeSteps(['ok']),
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => {
                events.push('teardownFn');
            },
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => {
                events.push('teardownWorkspaceFn');
                return '';
            },
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.message).toMatch(/Failed to add and commit for context ctx/i);
            expect((result.data as { reason?: string }).reason).toBe('gitAddCommitFailed');
        }
        expect(events).toContain('teardownFn');
        expect(events).toContain('gitAddCommit');
        expect(events).toContain('teardownWorkspaceFn');
        expect(events).not.toContain('gitPush');
    });

    it('O1: single context success order — walk → teardownFn → git → push → workspace teardown', async () => {
        const events: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            ...recordingGitFns(events),
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [{
                commandFn: () => {
                    events.push('walk');
                    return { executable: 'echo', args: ['ok'] };
                },
            }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async ({ currentContextIndex }) => {
                events.push(`teardownFn:${currentContextIndex}`);
            },
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => {
                events.push('teardownWorkspaceFn');
                return '';
            },
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(true);
        expect(events).toEqual([
            'walk',
            'teardownFn:0',
            'gitAddCommit',
            'gitPush',
            'teardownWorkspaceFn',
        ]);
    });

    it('O2: two contexts success order — per-context teardown+git, then push, then workspace teardown', async () => {
        const events: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [
                { name: 'ctx-a', variables: {} },
                { name: 'ctx-b', variables: {} },
            ],
            gitAddCommitFn: () => {
                events.push('gitAddCommit');
                return success('echo git-add-commit');
            },
            gitPushFn: () => {
                events.push('gitPush');
                return success('echo git-push');
            },
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [{
                commandFn: ({ context }) => {
                    events.push(`walk:${context.name}`);
                    return { executable: 'echo', args: ['ok'] };
                },
            }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async ({ currentContextIndex }) => {
                events.push(`teardownFn:${currentContextIndex}`);
            },
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => {
                events.push('teardownWorkspaceFn');
                return '';
            },
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(true);
        expect(events).toEqual([
            'walk:ctx-a',
            'teardownFn:0',
            'gitAddCommit',
            'walk:ctx-b',
            'teardownFn:1',
            'gitAddCommit',
            'gitPush',
            'teardownWorkspaceFn',
        ]);
    });

    it('M1: first context OK, second walk fails — teardown both, git only first, no push', async () => {
        const events: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [
                { name: 'ctx-a', variables: {} },
                { name: 'ctx-b', variables: {} },
            ],
            gitAddCommitFn: () => {
                events.push('gitAddCommit');
                return success('echo git-add-commit');
            },
            gitPushFn: () => {
                events.push('gitPush');
                return success('echo git-push');
            },
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [{
                commandFn: ({ context }) => {
                    events.push(`walk:${context.name}`);
                    if (context.name === 'ctx-b') {
                        return { executable: 'sh', args: ['-c', 'exit 1'] };
                    }
                    return { executable: 'echo', args: ['ok'] };
                },
            }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async ({ currentContextIndex }) => {
                events.push(`teardownFn:${currentContextIndex}`);
            },
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => {
                events.push('teardownWorkspaceFn');
                return '';
            },
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect((result.data as { reason?: string }).reason).toBe('stepWalkFailed');
        }
        expect(events).toEqual([
            'walk:ctx-a',
            'teardownFn:0',
            'gitAddCommit',
            'walk:ctx-b',
            'teardownFn:1',
            'teardownWorkspaceFn',
        ]);
    });
});
