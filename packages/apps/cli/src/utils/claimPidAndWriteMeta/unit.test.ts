import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { noopLogger } from '../noopLogger';
import { claimPidAndWriteMeta, removeOwnPidArtifacts } from './main';

describe('claimPidAndWriteMeta', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-claim-pid-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('claims the pid file and writes meta', async () => {
        const pidFilePath = path.join(dir, 'demo.pid');
        const metaFilePath = path.join(dir, 'demo.meta.json');
        const result = await claimPidAndWriteMeta({
            pid: process.pid,
            pidFilePath,
            meta: { filePath: metaFilePath, data: { daemonId: 'global' } },
            onMetaFailure: 'fail',
        });
        expect(result.success).toBe(true);
        expect((await fs.readFile(pidFilePath, 'utf8')).trim()).toBe(String(process.pid));
        const meta = JSON.parse(await fs.readFile(metaFilePath, 'utf8')) as { daemonId: string };
        expect(meta.daemonId).toBe('global');
    });

    it('warns and keeps the pid file when meta write fails', async () => {
        const pidFilePath = path.join(dir, 'demo.pid');
        const metaFilePath = path.join(dir, 'nested', 'nope', 'meta.json');
        const warn = vi.fn();
        const logger = { ...noopLogger, warn };
        await fs.mkdir(metaFilePath, { recursive: true });
        const result = await claimPidAndWriteMeta({
            pid: process.pid,
            pidFilePath,
            meta: { filePath: metaFilePath, data: { daemonId: 'global' } },
            onMetaFailure: 'warn',
            logger,
        });
        expect(result.success).toBe(true);
        expect((await fs.readFile(pidFilePath, 'utf8')).trim()).toBe(String(process.pid));
        expect(warn).toHaveBeenCalledOnce();
    });

    it('creates the PID file when it does not exist', async () => {
        const pidFilePath = path.join(dir, 'demo.pid');
        const result = await claimPidAndWriteMeta({
            pid: 4242,
            pidFilePath,
            onMetaFailure: 'fail',
        });
        expect(result.success).toBe(true);
        expect((await fs.readFile(pidFilePath, 'utf8')).trim()).toBe('4242');
    });

    it('succeeds when the file already holds the same live pid', async () => {
        const pidFilePath = path.join(dir, 'self.pid');
        const pid = process.pid;
        await fs.writeFile(pidFilePath, String(pid), 'utf8');
        const result = await claimPidAndWriteMeta({
            pid,
            pidFilePath,
            onMetaFailure: 'fail',
        });
        expect(result.success).toBe(true);
    });

    it('fails when another live pid holds the file', async () => {
        const pidFilePath = path.join(dir, 'other.pid');
        await fs.writeFile(pidFilePath, String(process.pid), 'utf8');
        const result = await claimPidAndWriteMeta({
            pid: process.pid + 1,
            pidFilePath,
            onMetaFailure: 'fail',
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/held by live pid/);
    });

    it('replaces a stale PID file and writes the new pid', async () => {
        const pidFilePath = path.join(dir, 'stale.pid');
        await fs.writeFile(pidFilePath, '999999999', 'utf8');
        const result = await claimPidAndWriteMeta({
            pid: 77,
            pidFilePath,
            onMetaFailure: 'fail',
        });
        expect(result.success).toBe(true);
        expect((await fs.readFile(pidFilePath, 'utf8')).trim()).toBe('77');
    });
});

describe('removeOwnPidArtifacts', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-own-pid-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('unlinks pid and extras when the pid file is this process', async () => {
        const pidFilePath = path.join(dir, 'own.pid');
        const metaFilePath = path.join(dir, 'own.meta.json');
        await fs.writeFile(pidFilePath, String(process.pid), 'utf8');
        await fs.writeFile(metaFilePath, '{}', 'utf8');
        await removeOwnPidArtifacts({ pidFilePath, extraFilePaths: [metaFilePath] });
        await expect(fs.access(pidFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.access(metaFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('leaves files when the pid file belongs to another process', async () => {
        const pidFilePath = path.join(dir, 'other.pid');
        await fs.writeFile(pidFilePath, String(process.pid + 1), 'utf8');
        await removeOwnPidArtifacts({ pidFilePath });
        await expect(fs.access(pidFilePath)).resolves.toBeUndefined();
    });
});
