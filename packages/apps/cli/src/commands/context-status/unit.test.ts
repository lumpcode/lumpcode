import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { command } from './main';
import { getGitCommitMessage } from '../../utils/getGitCommitMessage';
import { execGit } from '../../utils/execGit';


describe('context-status command', () => {
    let projectRoot: string;
    let bareDir: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-context-status-'));
        bareDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-context-status-bare-'));

        execGit('init --bare', bareDir);
        execGit('init -b main', projectRoot);
        execGit('config user.email "test@test.com"', projectRoot);
        execGit('config user.name "Test"', projectRoot);
        execGit('commit --allow-empty -m "init"', projectRoot);
        execGit(`remote add origin ${bareDir}`, projectRoot);
        execGit('push -u origin main', projectRoot);

        await fs.mkdir(path.join(projectRoot, '.lumpcode'), { recursive: true });
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
    }, 60_000);

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(bareDir, { recursive: true, force: true });
    }, 60_000);

    async function writeLump(lumpName: string, contextKey: string) {
        const lumpDir = path.join(localConfigFolderPath, 'lumps', lumpName);
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(
            path.join(lumpDir, 'config.json'),
            JSON.stringify({
                baseBranch: 'main',
                contextListJson: { CTX: contextKey },
                prompt: { promptTemplate: 'task', command: 'claude' },
            }),
            'utf-8',
        );
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
});
