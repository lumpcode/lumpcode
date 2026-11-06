import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { command } from './main';
import { LUMP_BRANCH_PREFIX, REFS_HEADS_PREFIX } from '../../consts';
import { getGitCommitMessage } from '../../utils/getGitCommitMessage';
import * as runProjectPreflightModule from '../../utils/runProjectPreflight';
import { createLumpWorkBranch, gitCurrentBranch, writeLocalJson } from '../../testing';
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

    it('removes all lump branches from local and remote', async () => {
        createLumpWorkBranch({ projectRoot, lumpName: 'myLump', contextName: 'button', useMarkerMessage: true });
        createLumpWorkBranch({ projectRoot, lumpName: 'myLump', contextName: 'form', useMarkerMessage: true });

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
        createLumpWorkBranch({ projectRoot, lumpName: 'alpha', contextName: 'ctx1', useMarkerMessage: true });
        createLumpWorkBranch({ projectRoot, lumpName: 'beta', contextName: 'ctx2', useMarkerMessage: true });

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
        createLumpWorkBranch({ projectRoot, lumpName: 'myLump', contextName: 'local-only', useMarkerMessage: true, push: false });

        const handle = makeHandler();
        const result = await handle({ options: {}, arguments: {} });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data.data!.deletedBranches).toContain(`${LUMP_BRANCH_PREFIX}myLump/local-only`);

        const localBranches = execGit(`branch --list "${LUMP_BRANCH_PREFIX}*"`, projectRoot);
        expect(localBranches).toBe('');
    });

    function mergeIntoMainAndPush(branch: string) {
        execGit('checkout main', projectRoot);
        execGit(`merge --no-ff ${branch} -m "merge ${branch}"`, projectRoot);
        execGit('push origin main', projectRoot);
    }

    it('contextName does not delete another lump branch cut from the merged base', async () => {
        const button = createLumpWorkBranch({ projectRoot, lumpName: 'myLump', contextName: 'button', useMarkerMessage: true });
        mergeIntoMainAndPush(button);
        const card = createLumpWorkBranch({ projectRoot, lumpName: 'otherLump', contextName: 'card', useMarkerMessage: true });

        const handle = makeHandler();
        const result = await handle({ options: { lumpName: 'myLump', contextName: 'button' }, arguments: {} });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data.data!.deletedBranches).not.toContain(card);
        expect(result.data.data!.deletedBranches).not.toContain(button);

        const remoteBranches = execGit('ls-remote --heads origin', projectRoot);
        expect(remoteBranches).toContain(`${REFS_HEADS_PREFIX}${card}`);
        expect(remoteBranches).toContain(`${REFS_HEADS_PREFIX}${button}`);

        const localCard = execGit(`branch --list ${card}`, projectRoot);
        expect(localCard).toContain('card');
    });

    it('contextName does not delete a same-lump branch cut from the merged base', async () => {
        const button = createLumpWorkBranch({ projectRoot, lumpName: 'myLump', contextName: 'button', useMarkerMessage: true });
        mergeIntoMainAndPush(button);
        const form = createLumpWorkBranch({ projectRoot, lumpName: 'myLump', contextName: 'form', useMarkerMessage: true });

        const handle = makeHandler();
        const result = await handle({ options: { lumpName: 'myLump', contextName: 'button' }, arguments: {} });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data.data!.deletedBranches).not.toContain(form);
        expect(result.data.data!.deletedBranches).not.toContain(button);

        const remoteBranches = execGit('ls-remote --heads origin', projectRoot);
        expect(remoteBranches).toContain(`${REFS_HEADS_PREFIX}${form}`);
        expect(remoteBranches).toContain(`${REFS_HEADS_PREFIX}${button}`);
    });

    it('contextName does not delete another lump branch that contains an unmerged marker', async () => {
        const button = createLumpWorkBranch({ projectRoot, lumpName: 'myLump', contextName: 'button', useMarkerMessage: true });
        const card = `${LUMP_BRANCH_PREFIX}otherLump/card`;
        const cardMessage = getGitCommitMessage({ contextName: 'card', lumpName: 'otherLump' });
        execGit(`checkout ${button}`, projectRoot);
        execGit(`checkout -b ${card}`, projectRoot);
        execGit(`commit --allow-empty -m "${cardMessage}"`, projectRoot);
        execGit(`push origin ${card}`, projectRoot);
        execGit('checkout main', projectRoot);

        const handle = makeHandler();
        const result = await handle({ options: { lumpName: 'myLump', contextName: 'button' }, arguments: {} });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data.data!.deletedBranches).toContain(button);
        expect(result.data.data!.deletedBranches).not.toContain(card);

        const remoteBranches = execGit('ls-remote --heads origin', projectRoot);
        expect(remoteBranches).not.toContain(`${REFS_HEADS_PREFIX}${button}`);
        expect(remoteBranches).toContain(`${REFS_HEADS_PREFIX}${card}`);
    });

    it('contextName scopes cleanup to a single context', async () => {
        createLumpWorkBranch({ projectRoot, lumpName: 'myLump', contextName: 'button', useMarkerMessage: true });
        createLumpWorkBranch({ projectRoot, lumpName: 'myLump', contextName: 'form', useMarkerMessage: true });

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
        const message = getGitCommitMessage({ contextName: 'button', lumpName: 'myLump' });
        const branch = createLumpWorkBranch({
            projectRoot,
            lumpName: 'myLump',
            contextName: 'button',
            message: 'PR title',
            commitBody: `* ${message}`,
        });

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
        createLumpWorkBranch({ projectRoot, lumpName: 'myLump', contextName: 'button', useMarkerMessage: true });
        const spy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');
        const handle = makeHandler();
        await handle({ options: {}, arguments: {} });
        expect(spy).not.toHaveBeenCalled();
    });

    it('does not switch integration branch during clean', async () => {
        createLumpWorkBranch({ projectRoot, lumpName: 'myLump', contextName: 'button', useMarkerMessage: true });
        const branchBefore = gitCurrentBranch(projectRoot);
        const handle = makeHandler();
        await handle({ options: {}, arguments: {} });
        expect(gitCurrentBranch(projectRoot)).toBe(branchBefore);
    });

    it('does not create or require project-copies in shared mode (in-place-workspace)', async () => {
        const localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await writeLocalJson(localConfigFolderPath, {
            mode: 'shared',
            primaryBranch: 'main',
        });
        createLumpWorkBranch({ projectRoot, lumpName: 'myLump', contextName: 'button', useMarkerMessage: true });

        const handle = command.handlerMaker({ projectRoot, globalConfigFolderPath });
        const result = await handle({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data!.deletedBranches).toContain(`${LUMP_BRANCH_PREFIX}myLump/button`);
        await expect(fs.access(path.join(globalConfigFolderPath, 'project-copies'))).rejects.toBeDefined();
    });

    it('works with LC-MULTI without parsing effective list for branch switch', async () => {
        const localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        });
        createLumpWorkBranch({ projectRoot, lumpName: 'myLump', contextName: 'ctx', useMarkerMessage: true });
        const branchBefore = gitCurrentBranch(projectRoot);
        const handle = makeHandler();
        const result = await handle({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        expect(gitCurrentBranch(projectRoot)).toBe(branchBefore);
    });
});
