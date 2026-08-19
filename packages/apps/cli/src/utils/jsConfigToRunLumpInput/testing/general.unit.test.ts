import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { shellSingleQuote } from '@lumpcode/core';

import { shellBestEffort } from '../../shellBestEffort';
import { LUMP_BRANCH_PREFIX, LUMP_COMMIT_PREFIX } from '../../../consts';
import { jsConfigToRunLumpInput } from '../main';
import {
    assertSuccess,
    DEFAULT_TEST_GLOBAL_CONFIG,
    DEFAULT_TEST_LOCAL_CONFIG,
    DEFAULT_TEST_PROJECT_BASE_BRANCH,
    DEFAULT_TEST_WORKSPACE,
    makeConfig,
    resolveJsConf,
} from './testHelpers';

describe('jsConfigToRunLumpInput', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should produce a valid RunLumpInput from a minimal config (baseBranch from projectBaseBranch)', async () => {
        const data = assertSuccess(await resolveJsConf({}));
        expect(data.baseBranch).toBe('main');
        expect(data.projectRoot).toBe('/tmp/project');
        expect(data.steps).toHaveLength(1);
        expect(typeof data.branchFn).toBe('function');
        expect(typeof data.getContextListFn).toBe('function');
        expect(typeof data.setupFn).toBe('function');
        expect(typeof data.teardownFn).toBe('function');
        expect(typeof data.setupWorkspaceFn).toBe('function');
        expect(typeof data.teardownWorkspaceFn).toBe('function');
    });

    it('should let lump-level baseBranch override projectBaseBranch', async () => {
        const data = assertSuccess(
            await resolveJsConf({ baseBranch: 'release/2.0' }, { projectBaseBranch: 'main' }),
        );
        expect(data.baseBranch).toBe('release/2.0');
    });

    describe('auto-generated setupWorkspaceFn / teardownWorkspaceFn', () => {
        it('returns branch workspace equal to execution workspace (checkout) and builds the per-lump git command from baseBranch + branchName', async () => {
            const data = assertSuccess(
                await resolveJsConf({}, { executionWorkspacePath: '/wkspace', projectBaseBranch: 'main' }),
            );

            const setupOut = await data.setupWorkspaceFn!({
                baseBranch: 'main',
                branchName: 'lump/foo/ctx',
                contextList: [{ name: 'ctx', variables: {} }],
            });
            expect(setupOut.workspacePath).toBe(path.resolve('/wkspace'));
            expect(setupOut.command).toContain(`cd '/wkspace'`);
            expect(setupOut.command).toContain(`git fetch --no-write-fetch-head origin ${shellSingleQuote('main')}`);
            expect(setupOut.command).toContain(`git switch ${shellSingleQuote('main')}`);
            expect(setupOut.command).toContain('git reset --hard origin/main');
            expect(setupOut.command).not.toContain('git pull origin');
            expect(setupOut.command).toContain(shellBestEffort(`git branch -D ${shellSingleQuote('lump/foo/ctx')}`));
            expect(setupOut.command).toContain(`git switch -c ${shellSingleQuote('lump/foo/ctx')}`);
        });

        it('teardown switches to lump resolved baseBranch (not projectBaseBranch)', async () => {
            const data = assertSuccess(
                await resolveJsConf(
                    { baseBranch: 'release/2.0' },
                    { projectBaseBranch: 'main', executionWorkspacePath: '/wkspace' },
                ),
            );
            const teardownCmd = await data.teardownWorkspaceFn!({
                baseBranch: 'release/2.0',
                branchName: 'lump/foo/ctx',
                contextList: [{ name: 'ctx', variables: {} }],
                workspacePath: '/wkspace',
            });
            expect(teardownCmd).toContain(`cd '/wkspace'`);
            expect(teardownCmd).toContain(`git switch ${shellSingleQuote('release/2.0')}`);
            expect(teardownCmd).not.toContain(`git switch ${shellSingleQuote('main')}`);
        });

        it('setup uses the lump-level baseBranch in its git commands', async () => {
            const data = assertSuccess(
                await resolveJsConf(
                    { baseBranch: 'release/2.0' },
                    { projectBaseBranch: 'main', executionWorkspacePath: '/wkspace' },
                ),
            );
            const setupOut = await data.setupWorkspaceFn!({
                baseBranch: 'release/2.0',
                branchName: 'lump/foo/ctx',
                contextList: [{ name: 'ctx', variables: {} }],
            });
            expect(setupOut.workspacePath).toBe(path.resolve('/wkspace'));
            expect(setupOut.command).toContain(
                `git fetch --no-write-fetch-head origin ${shellSingleQuote('release/2.0')}`,
            );
            expect(setupOut.command).not.toContain('git pull origin');
        });

        it('worktree strategy returns worktree path and worktree add command', async () => {
            const data = assertSuccess(
                await resolveJsConf({}, { executionWorkspacePath: '/wkspace', workspaceStrategy: 'worktree' }),
            );
            const setupOut = await data.setupWorkspaceFn!({
                baseBranch: 'main',
                branchName: 'lump/foo/ctx',
                contextList: [{ name: 'ctx', variables: {} }],
            });
            expect(setupOut.workspacePath).toBe(
                path.join(path.resolve('/wkspace'), '.lumpcode', 'worktrees', 'lump', 'foo', 'ctx'),
            );
            expect(setupOut.command).toContain(`cd '/wkspace'`);
            expect(setupOut.command).toContain(`worktree add -B ${shellSingleQuote('lump/foo/ctx')}`);
            expect(setupOut.command).toContain(shellSingleQuote('origin/main'));
        });
    });

    describe('gitCommitMessageFn', () => {
        it('should namespace commit messages with lumpName', async () => {
            const data = assertSuccess(await resolveJsConf({}, { lumpName: 'migrate-vue' }));
            expect(data.gitCommitMessageFn!({
                context: { name: 'button', variables: {} },
                lumpVariables: {},
                baseBranch: 'main',
            })).toBe(`${LUMP_COMMIT_PREFIX}migrate-vue - button`);
        });

        it('should resolve cross-lump dependsOn markers from lumpName/contextName', async () => {
            const data = assertSuccess(await resolveJsConf({}, { lumpName: 'consumer' }));
            expect(data.gitCommitMessageFn!({
                context: { name: 'depLump/README', variables: {} },
                lumpVariables: {},
                baseBranch: 'main',
            })).toBe(`${LUMP_COMMIT_PREFIX}depLump - README`);
        });
    });

    describe('keepHistory', () => {
        const ctx = { name: 'ctx', variables: {} };

        it('returns undefined when keepHistory is omitted', async () => {
            const data = assertSuccess(await resolveJsConf({}));
            expect(data.getKeepHistoryFilePathFn!(ctx)).toBeUndefined();
        });

        it('returns undefined when keepHistory is false', async () => {
            const data = assertSuccess(await resolveJsConf({ keepHistory: false }));
            expect(data.getKeepHistoryFilePathFn!(ctx)).toBeUndefined();
        });

        it('returns the per-context history path when keepHistory is true', async () => {
            const lumpName = 'my-lump';
            const data = assertSuccess(await resolveJsConf({ keepHistory: true }, { lumpName }));
            expect(data.getKeepHistoryFilePathFn!(ctx)).toBe(
                path.join('/tmp/project', '.lumpcode', 'lumps', lumpName, 'history', 'ctx.yaml'),
            );
        });
    });

    describe('branchFn resolution', () => {
        const branchFnInput = (contextName: string) => ({
            contextList: [{ name: contextName, variables: {} }],
            contextRunStateList: [{}],
            lumpVariables: {},
        });

        it('should use the branch name based on lumpName', async () => {
            const data = assertSuccess(await resolveJsConf(
                {},
                { lumpName: 'refactor' },
            ));
            expect(await data.branchFn(branchFnInput('header'))).toBe(`${LUMP_BRANCH_PREFIX}refactor/header`);
        });

        it('should use a stable hash suffix when multiple contexts share one branch', async () => {
            const data = assertSuccess(await resolveJsConf({}, { lumpName: 'refactor' }));
            const names = ['header', 'footer'];
            const hash = createHash('sha256').update([...names].sort().join('\0')).digest('hex').slice(0, 12);
            const multiContextInput = {
                contextList: names.map((name) => ({ name, variables: {} })),
                contextRunStateList: [{}, {}],
                lumpVariables: {},
            };
            expect(await data.branchFn(multiContextInput)).toBe(`${LUMP_BRANCH_PREFIX}refactor/${hash}`);
            expect(await data.branchFn({
                ...multiContextInput,
                contextList: [...multiContextInput.contextList].reverse(),
            })).toBe(`${LUMP_BRANCH_PREFIX}refactor/${hash}`);
        });
    });

    describe('passthrough fields', () => {
        it('should pass through optional RunLumpInput fields', async () => {
            const data = assertSuccess(await resolveJsConf({ numberOfContextsPerBranch: 3, verbose: true, lumpVariables: { framework: 'vue' } }));
            expect(data.numberOfContextsPerBranch).toBe(3);
            expect(data.lumpVariables).toEqual({ framework: 'vue' });
            expect('verbose' in data).toBe(false);
        });
    });

    describe('gated git fns', () => {
        it('spreads gitAddCommitFn + gitPushFn when gitLock is set', async () => {
            const result = await jsConfigToRunLumpInput({
                config: makeConfig({}),
                lumpName: 'my-lump',
                localConfigFolderPath: DEFAULT_TEST_LOCAL_CONFIG,
                globalConfigFolderPath: DEFAULT_TEST_GLOBAL_CONFIG,
                projectBaseBranch: DEFAULT_TEST_PROJECT_BASE_BRANCH,
                executionWorkspacePath: DEFAULT_TEST_WORKSPACE,
                workspaceStrategy: 'checkout',
                gitLock: {
                    globalConfigFolderPath: DEFAULT_TEST_GLOBAL_CONFIG,
                    gitCwd: DEFAULT_TEST_WORKSPACE,
                    lumpName: 'my-lump',
                    lockMode: 'fail',
                },
            });
            const data = assertSuccess(result);
            expect(typeof data.gitAddCommitFn).toBe('function');
            expect(typeof data.gitPushFn).toBe('function');
            expect('gitAddCommandFn' in data).toBe(false);
            expect('gitCommitCommandFn' in data).toBe(false);
            expect('gitPushCommandFn' in data).toBe(false);
        });

        it('omits gated git hooks when gitLock is unset', async () => {
            const data = assertSuccess(await resolveJsConf({}));
            expect(data.gitAddCommitFn).toBeUndefined();
            expect(data.gitPushFn).toBeUndefined();
        });
    });

    describe('project root resolution', () => {
        it('should derive projectRoot from localConfigFolderPath', async () => {
            const data = assertSuccess(
                await resolveJsConf({}, { localConfigFolderPath: '/home/user/project/.lumpcode' }),
            );
            expect(data.projectRoot).toBe('/home/user/project');
        });
    });
});
