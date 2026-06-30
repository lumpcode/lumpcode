import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { command } from './main';
import { LUMP_BRANCH_PREFIX, REFS_HEADS_PREFIX } from '../../consts';
import { getGitCommitMessage } from '../../utils/getGitCommitMessage';
import * as runProjectPreflightModule from '../../utils/runProjectPreflight';
import { gitCurrentBranch, writeLocalJson } from '../../testing';
import { runProjectPreflight } from '../../utils/runProjectPreflight';

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

function gitOutput(cmd: string, cwd: string): string {
    return execSync(`git ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim();
}

describe('clean command', () => {
    let projectRoot: string;
    let bareDir: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-clean-'));
        bareDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-clean-bare-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-clean-global-'));

        git('init --bare', bareDir);
        git('init -b main', projectRoot);
        git('config user.email "test@test.com"', projectRoot);
        git('config user.name "Test"', projectRoot);
        git('commit --allow-empty -m "init"', projectRoot);
        git(`remote add origin ${bareDir}`, projectRoot);
        git('push -u origin main', projectRoot);

        const lumpcodeDir = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(lumpcodeDir);
        await Promise.all([
            fs.writeFile(
                path.join(lumpcodeDir, 'project.json'),
                JSON.stringify({ projectName: 'clean-test' }),
                'utf-8',
            ),
            fs.writeFile(
                path.join(lumpcodeDir, 'local.json'),
                JSON.stringify({ mode: 'dedicated', discoveryBranch: 'main' }),
                'utf-8',
            ),
        ]);
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(bareDir, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    function makeHandler() {
        return command.handlerMaker({ projectRoot });
    }

    function setupLumpBranch(lumpName: string, contextName: string, opts: { push?: boolean } = { push: true }) {
        const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
        const message = getGitCommitMessage({ contextName, lumpName });
        git('checkout main', projectRoot);
        git(`checkout -b ${branch}`, projectRoot);
        git(`commit --allow-empty -m "${message}"`, projectRoot);
        if (opts.push) {
            git(`push origin ${branch}`, projectRoot);
        }
        git('checkout main', projectRoot);
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

        const remoteBranches = gitOutput('ls-remote --heads origin', projectRoot);
        expect(remoteBranches).toContain(`${REFS_HEADS_PREFIX}main`);
        expect(remoteBranches).not.toContain(LUMP_BRANCH_PREFIX);

        const localBranches = gitOutput(`branch --list "${LUMP_BRANCH_PREFIX}*"`, projectRoot);
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

        const remoteBranches = gitOutput('ls-remote --heads origin', projectRoot);
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

        const localBranches = gitOutput(`branch --list "${LUMP_BRANCH_PREFIX}*"`, projectRoot);
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

        const remoteBranches = gitOutput('ls-remote --heads origin', projectRoot);
        expect(remoteBranches).not.toContain(`${LUMP_BRANCH_PREFIX}myLump/button`);
        expect(remoteBranches).toContain(`${LUMP_BRANCH_PREFIX}myLump/form`);
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
            discoveryBranch: 'main',
            discoveryBranches: ['main', 'ver/0.0.9'],
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
        git(`checkout -b ${branch}`, copyRoot);
        git(`commit --allow-empty -m "${message}"`, copyRoot);
        git(`push origin ${branch}`, copyRoot);
        git('checkout main', copyRoot);
        git('checkout main', projectRoot);

        const handle = command.handlerMaker({ projectRoot, globalConfigFolderPath });
        const result = await handle({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data!.deletedBranches).toContain(branch);

        const copyBranches = gitOutput(`branch --list "${LUMP_BRANCH_PREFIX}*"`, copyRoot);
        expect(copyBranches).toBe('');
    });

    it('works with LC-MULTI without parsing effective list for branch switch', async () => {
        const localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            discoveryBranch: 'main',
            discoveryBranches: ['main', 'ver/0.0.9'],
        });
        setupLumpBranch('myLump', 'ctx');
        const branchBefore = gitCurrentBranch(projectRoot);
        const handle = makeHandler();
        const result = await handle({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        expect(gitCurrentBranch(projectRoot)).toBe(branchBefore);
    });
});
