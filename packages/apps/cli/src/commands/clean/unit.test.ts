import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { command } from './main';
import { LUMP_BRANCH_PREFIX, REFS_HEADS_PREFIX } from '../../consts';
import { getGitCommitMessage } from '../../utils/getGitCommitMessage';
import * as runProjectPreflightModule from '../../utils/runProjectPreflight';
import { gitCurrentBranch, writeLocalJson } from '../../testing';
import { runProjectPreflight } from '../../utils/runProjectPreflight';
import { execGit, initBareRemoteAndCheckout, createTempTestDirs, removeTempTestDirs } from '../../utils';
import { writeJsonFile } from '../../utils/writeJsonFile';

describe('clean command', () => {
    let projectRoot: string;
    let bareDir: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        const dirs = await createTempTestDirs({ prefix: 'lump-clean-' });
        projectRoot = dirs.projectRoot;
        bareDir = dirs.remoteDir;
        globalConfigFolderPath = dirs.globalConfigFolderPath;
        const lumpcodeDir = dirs.localConfigFolderPath;

        initBareRemoteAndCheckout({ projectRoot, remoteDir: bareDir });

        await Promise.all([
            writeJsonFile({
                filePath: path.join(lumpcodeDir, 'project.json'),
                data: { projectName: 'clean-test' },
            }),
            writeJsonFile({
                filePath: path.join(lumpcodeDir, 'local.json'),
                data: { mode: 'dedicated', primaryBranch: 'main' },
            }),
        ]);
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, remoteDir: bareDir, globalConfigFolderPath });
        vi.restoreAllMocks();
    });

    function makeHandler() {
        return command.handlerMaker({ projectRoot });
    }

    function setupLumpBranch(lumpName: string, contextName: string, opts: { push?: boolean } = { push: true }) {
        const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
        const message = getGitCommitMessage({ contextName, lumpName });
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        execGit(`commit --allow-empty -m "${message}"`, projectRoot);
        if (opts.push) {
            execGit(`push origin ${branch}`, projectRoot);
        }
        execGit('checkout main', projectRoot);
        return branch;
    }

    it('removes all lump branches from local and remote', async () => {
        setupLumpBranch('myLump', 'button');
        setupLumpBranch('myLump', 'form');

        const handle = makeHandler();
        const result = await handle({ options: {}, arguments: {} });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data.data!.deletedBranches).toHaveLength(2);

        const remoteBranches = execGit('ls-remote --heads origin', projectRoot);
        expect(remoteBranches).toContain(`${REFS_HEADS_PREFIX}main`);
        expect(remoteBranches).not.toContain(LUMP_BRANCH_PREFIX);

        const localBranches = execGit(`branch --list "${LUMP_BRANCH_PREFIX}*"`, projectRoot);
        expect(localBranches).toBe('');
    });

    it('scopes cleanup to a single lump when lumpName is provided', async () => {
        setupLumpBranch('alpha', 'ctx1');
        setupLumpBranch('beta', 'ctx2');

        const handle = makeHandler();
        const result = await handle({ options: { lumpName: 'alpha' }, arguments: {} });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data.data!.deletedBranches).toEqual([`${LUMP_BRANCH_PREFIX}alpha/ctx1`]);

        const remoteBranches = execGit('ls-remote --heads origin', projectRoot);
        expect(remoteBranches).not.toContain(`${LUMP_BRANCH_PREFIX}alpha/`);
        expect(remoteBranches).toContain(`${LUMP_BRANCH_PREFIX}beta/ctx2`);
    });

    it('succeeds with zero deletions when no lump branches exist', async () => {
        const handle = makeHandler();
        const result = await handle({ options: {}, arguments: {} });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data.data!.deletedBranches).toHaveLength(0);
    });

    it('cleans local-only branches that were never pushed', async () => {
        setupLumpBranch('myLump', 'local-only', { push: false });

        const handle = makeHandler();
        const result = await handle({ options: {}, arguments: {} });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data.data!.deletedBranches).toContain(`${LUMP_BRANCH_PREFIX}myLump/local-only`);

        const localBranches = execGit(`branch --list "${LUMP_BRANCH_PREFIX}*"`, projectRoot);
        expect(localBranches).toBe('');
    });

    it('contextName scopes cleanup to a single context', async () => {
        setupLumpBranch('myLump', 'button');
        setupLumpBranch('myLump', 'form');

        const handle = makeHandler();
        const result = await handle({ options: { lumpName: 'myLump', contextName: 'button' }, arguments: {} });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data.data!.deletedBranches).toContain(`${LUMP_BRANCH_PREFIX}myLump/button`);
        expect(result.data.data!.deletedBranches).not.toContain(`${LUMP_BRANCH_PREFIX}myLump/form`);

        const remoteBranches = execGit('ls-remote --heads origin', projectRoot);
        expect(remoteBranches).not.toContain(`${LUMP_BRANCH_PREFIX}myLump/button`);
        expect(remoteBranches).toContain(`${LUMP_BRANCH_PREFIX}myLump/form`);
    });

    it('contextName finds a marker in the commit body', async () => {
        const branch = `${LUMP_BRANCH_PREFIX}myLump/button`;
        const message = getGitCommitMessage({ contextName: 'button', lumpName: 'myLump' });
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        execGit(`commit --allow-empty -m "PR title" -m "* ${message}"`, projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
        execGit('checkout main', projectRoot);

        const handle = makeHandler();
        const result = await handle({ options: { lumpName: 'myLump', contextName: 'button' }, arguments: {} });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data!.deletedBranches).toContain(branch);
    });

    it('contextName without lumpName fails', async () => {
        const handle = makeHandler();
        const result = await handle({ options: { contextName: 'button' }, arguments: {} });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('--contextName requires --lumpName');
    });

    it('contextName that does not exist succeeds with zero deletions', async () => {
        const handle = makeHandler();
        const result = await handle({ options: { lumpName: 'myLump', contextName: 'nonexistent' }, arguments: {} });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data.data!.deletedBranches).toHaveLength(0);
    });

    it('fails when not in a lumpcode project root', async () => {
        const nonProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-clean-noproject-'));
        try {
            const handle = command.handlerMaker({ projectRoot: nonProjectDir });
            const result = await handle({ options: {}, arguments: {} });

            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain('Not a Lumpcode project root');
        } finally {
            await fs.rm(nonProjectDir, { recursive: true, force: true });
        }
    });

    it('does not call runProjectPreflight', async () => {
        setupLumpBranch('myLump', 'button');
        const spy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');
        const handle = makeHandler();
        await handle({ options: {}, arguments: {} });
        expect(spy).not.toHaveBeenCalled();
    });

    it('does not switch integration branch during clean', async () => {
        setupLumpBranch('myLump', 'button');
        const branchBefore = gitCurrentBranch(projectRoot);
        const handle = makeHandler();
        await handle({ options: {}, arguments: {} });
        expect(gitCurrentBranch(projectRoot)).toBe(branchBefore);
    });

    it('cleans shared copy lump branches when copy exists (LC-SHARED)', async () => {
        const localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await writeLocalJson(localConfigFolderPath, {
            mode: 'shared',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        });
        const preflight = await runProjectPreflight({
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
        expect(preflight.success).toBe(true);
        if (!preflight.success) throw new Error('unreachable');

        const copyRoot = preflight.data.executionWorkspacePath;
        const branch = `${LUMP_BRANCH_PREFIX}myLump/shared-copy`;
        const message = getGitCommitMessage({ contextName: 'shared-copy', lumpName: 'myLump' });
        execGit(`checkout -b ${branch}`, copyRoot);
        execGit(`commit --allow-empty -m "${message}"`, copyRoot);
        execGit(`push origin ${branch}`, copyRoot);
        execGit('checkout main', copyRoot);
        execGit('checkout main', projectRoot);

        const handle = command.handlerMaker({ projectRoot, globalConfigFolderPath });
        const result = await handle({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data!.deletedBranches).toContain(branch);

        const copyBranches = execGit(`branch --list "${LUMP_BRANCH_PREFIX}*"`, copyRoot);
        expect(copyBranches).toBe('');
    });

    it('works with LC-MULTI without parsing effective list for branch switch', async () => {
        const localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        });
        setupLumpBranch('myLump', 'ctx');
        const branchBefore = gitCurrentBranch(projectRoot);
        const handle = makeHandler();
        const result = await handle({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        expect(gitCurrentBranch(projectRoot)).toBe(branchBefore);
    });
});
