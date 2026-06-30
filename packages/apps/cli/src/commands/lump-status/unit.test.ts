import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { command } from './main';
import { contextStatusRecordPath } from '../../utils/contextStatusRecordPath';
import * as runProjectPreflightModule from '../../utils/runProjectPreflight';
import { gitCurrentBranch } from '../../testing';

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

describe('lump-status command', () => {
    let projectRoot: string;
    let bareDir: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-'));
        bareDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-bare-'));

        git('init --bare', bareDir);
        git('init -b main', projectRoot);
        git('config user.email "test@test.com"', projectRoot);
        git('config user.name "Test"', projectRoot);
        git('commit --allow-empty -m "init"', projectRoot);
        git(`remote add origin ${bareDir}`, projectRoot);
        git('push -u origin main', projectRoot);

        await fs.mkdir(path.join(projectRoot, '.lumpcode'), { recursive: true });
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'shared', primaryBranch: 'main' }),
            'utf-8',
        );
    }, 60_000);

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(bareDir, { recursive: true, force: true });
    }, 60_000);

    async function writeLump(lumpName: string) {
        const lumpDir = path.join(localConfigFolderPath, 'lumps', lumpName);
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(
            path.join(lumpDir, 'config.json'),
            JSON.stringify({
                baseBranch: 'main',
                contextListJson: { c1: 'README.md' },
                prompt: { promptTemplate: 'task', command: 'claude' },
            }),
            'utf-8',
        );
    }

    function makeHandler() {
        return command.handlerMaker({ projectRoot, localConfigFolderPath });
    }

    it(
        'refreshes status for all lumps and writes contextStatusRecord.json',
        async () => {
        await writeLump('alpha');
        const handle = makeHandler();
        const result = await handle({
            options: {},
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data!.statusByLump.alpha).toEqual({});
        const csrPath = contextStatusRecordPath({ projectRoot, lumpName: 'alpha' });
        const onDisk = JSON.parse(await fs.readFile(csrPath, 'utf-8'));
        expect(onDisk).toEqual({});
        },
        60_000,
    );

    it(
        'scopes to --lumpName',
        async () => {
        await writeLump('a');
        await writeLump('b');
        const handle = makeHandler();
        const result = await handle({
            options: { lumpName: 'b' },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(Object.keys(result.data.data!.statusByLump)).toEqual(['b']);
        },
        60_000,
    );

    it('fails for unknown lump name', async () => {
        await writeLump('only');
        const handle = makeHandler();
        const result = await handle({
            options: { lumpName: 'missing' },
            arguments: {},
        });
        expect(result.success).toBe(false);
    }, 60_000);

    it('with silent true (--silent), messages summarize paths instead of dumping JSON',
        async () => {
        await writeLump('alpha');
        const handle = makeHandler();
        const result = await handle({
            options: { silent: true },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages.some((m) => m.includes('Wrote:'))).toBe(true);
        expect(result.data.messages.some((m) => m.trim().startsWith('{'))).toBe(false);
        },
        60_000,
    );

    it('does not call runProjectPreflight', async () => {
        await writeLump('alpha');
        const spy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');
        await makeHandler()({
            options: {},
            arguments: {},
        });
        expect(spy).not.toHaveBeenCalled();
    }, 60_000);

    it('leaves checkout branch unchanged', async () => {
        await writeLump('alpha');
        const before = gitCurrentBranch(projectRoot);
        await makeHandler()({
            options: {},
            arguments: {},
        });
        expect(gitCurrentBranch(projectRoot)).toBe(before);
    }, 60_000);

    it('fails allowlist validation for unlisted discoveryBranch (dedicated)', async () => {
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main'],
            }),
            'utf-8',
        );
        const lumpDir = path.join(localConfigFolderPath, 'lumps', 'unlisted');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(
            path.join(lumpDir, 'config.json'),
            JSON.stringify({
                discoveryBranch: 'ver/0.0.9',
                contextListJson: { c1: 'README.md' },
                prompt: { promptTemplate: 'task', command: 'claude' },
            }),
            'utf-8',
        );

        const result = await makeHandler()({
            options: {},
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/discoveryBranch|primaryBranches|ver\/0\.0\.9/i);
    }, 60_000);

    it('succeeds in shared mode when discoveryBranch is unlisted (no allowlist)', async () => {
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({
                mode: 'shared',
                primaryBranch: 'main',
                primaryBranches: ['main'],
            }),
            'utf-8',
        );
        const lumpDir = path.join(localConfigFolderPath, 'lumps', 'unlisted');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(
            path.join(lumpDir, 'config.json'),
            JSON.stringify({
                discoveryBranch: 'ver/0.0.9',
                contextListJson: { c1: 'README.md' },
                prompt: { promptTemplate: 'task', command: 'claude' },
            }),
            'utf-8',
        );

        const result = await makeHandler()({
            options: {},
            arguments: {},
        });
        expect(result.success).toBe(true);
    }, 60_000);
});
