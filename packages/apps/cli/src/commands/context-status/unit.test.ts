import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { command } from './main';
import { getGitCommitMessage } from '../../utils/getGitCommitMessage';
import { execGit, initBareRemoteAndCheckout, createTempTestDirs, removeTempTestDirs } from '../../utils';
import { writeJsonFile } from '../../utils/writeJsonFile';

describe('context-status command', () => {
    let projectRoot: string;
    let bareDir: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        ({ projectRoot, remoteDir: bareDir, localConfigFolderPath } = await createTempTestDirs({ prefix: 'lump-context-status-', global: false }));
        initBareRemoteAndCheckout({ projectRoot, remoteDir: bareDir });
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'project.json'),
            data: { projectName: 'context-status-test' },
        });
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'local.json'),
            data: { mode: 'shared', primaryBranch: 'main' },
        });
    }, 60_000);

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, remoteDir: bareDir });
    }, 60_000);

    async function writeLump(
        lumpName: string,
        contextKey: string,
        extra: Record<string, unknown> = { baseBranch: 'main' },
    ) {
        const lumpDir = path.join(localConfigFolderPath, 'lumps', lumpName);
        await fs.mkdir(lumpDir, { recursive: true });
        await writeJsonFile({
            filePath: path.join(lumpDir, 'config.json'),
            data: {
                contextListJson: [{ name: contextKey, variables: { CTX: contextKey } }],
                prompt: { promptTemplate: 'task', command: 'claude' },
                ...extra,
            },
        });
    }

    async function writeDedicatedLocal() {
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'local.json'),
            data: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'feature/*'],
            },
        });
    }

    function makeHandler() {
        return command.handlerMaker({ projectRoot, localConfigFolderPath });
    }

    it('prints a toDo record when the context has no matching remote commits', async () => {
        await writeLump('alpha', 'c1');
        const handle = makeHandler();
        const result = await handle({
            options: {},
            arguments: { lumpName: 'alpha', contextName: 'c1' },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data!.item).toEqual({ 
            status: 'toDo', 
            contextName: 'c1', 
            branchName: '', 
            commitMessage: '' 
        });
    }, 60_000);

    it('marks finished with --setToFinished and refreshes the record', async () => {
        const lumpName = 'alpha';
        const contextName = 'c1';
        await writeLump(lumpName, contextName);
        const handle = makeHandler();
        const result = await handle({
            options: { setToFinished: true },
            arguments: { lumpName, contextName },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data!.item).toEqual({ 
            status: 'finished', 
            contextName, 
            branchName: '', 
            commitMessage: getGitCommitMessage({ contextName, lumpName }) 
        });
    }, 60_000);

    it('fails for an unknown lump', async () => {
        const handle = makeHandler();
        const result = await handle({
            options: {},
            arguments: { lumpName: 'missing', contextName: 'x' },
        });
        expect(result.success).toBe(false);
    }, 60_000);

    it('prints a toDo record when the lump omits baseBranch', async () => {
        await writeLump('alpha', 'c1', {});
        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'alpha', contextName: 'c1' },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data!.item).toEqual({
            status: 'toDo',
            contextName: 'c1',
            branchName: '',
            commitMessage: '',
        });
    }, 60_000);

    it('marks finished on primaryBranch when the lump omits baseBranch', async () => {
        const lumpName = 'alpha';
        const contextName = 'c1';
        await writeLump(lumpName, contextName, {});
        const result = await makeHandler()({
            options: { setToFinished: true },
            arguments: { lumpName, contextName },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        const commitMessage = getGitCommitMessage({ contextName, lumpName });
        expect(result.data.data!.item).toEqual({
            status: 'finished',
            contextName,
            branchName: '',
            commitMessage,
        });
        expect(execGit('log origin/main -1 --format=%s', projectRoot)).toBe(commitMessage);
    }, 60_000);

    it('fails a pattern-only lump without --discoveryBranch', async () => {
        await writeDedicatedLocal();
        await writeLump('alpha', 'c1', { discoveryBranch: 'feature/*' });
        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'alpha', contextName: 'c1' },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/--discoveryBranch/);
    }, 60_000);

    it('accepts a concrete --discoveryBranch that matches a pattern rule', async () => {
        await writeDedicatedLocal();
        await writeLump('alpha', 'c1', { discoveryBranch: 'feature/*' });
        const result = await makeHandler()({
            options: { discoveryBranch: 'feature/a' },
            arguments: { lumpName: 'alpha', contextName: 'c1' },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data!.item.status).toBe('toDo');
    }, 60_000);

    it('rejects an empty baseBranch', async () => {
        await writeLump('alpha', 'c1', { baseBranch: '' });
        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'alpha', contextName: 'c1' },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/must be a concrete branch string/);
    }, 60_000);
});
