import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeJsonFile } from '../writeJsonFile';
import { drainOrStopOneDaemon, stopOneDaemon, stopSupervisor } from './main';

describe('stopOneDaemon', () => {
    let dir: string;
    let pidFilePath: string;
    let metaFilePath: string;
    let desiredFilePath: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-stop-one-'));
        pidFilePath = path.join(dir, 'demo.global.daemon.pid');
        metaFilePath = path.join(dir, 'demo.global.daemon.meta.json');
        desiredFilePath = path.join(dir, 'demo.global.daemon.desired.json');
        await fs.writeFile(pidFilePath, String(process.pid), 'utf8');
        await writeJsonFile({
            filePath: desiredFilePath,
            data: { projectRoot: dir, daemonId: 'global', cronSetup: '*/5 * * * *' },
        });
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('refuses when mid-run', async () => {
        await writeJsonFile({
            filePath: metaFilePath,
            data: {
                daemonId: 'global',
                cronSetup: '*/5 * * * *',
                workspaceStrategy: 'checkout',
                inFlightLumpCount: 1,
            },
        });
        const result = await stopOneDaemon({
            pidFilePath,
            metaFilePath,
            desiredFilePath,
            force: false,
            waitMs: 200,
        });
        expect(result.status).toBe('busy');
        await expect(fs.access(pidFilePath)).resolves.toBeUndefined();
    });

    it('refuses when meta is corrupt', async () => {
        await fs.writeFile(metaFilePath, '{ not json', 'utf8');
        const result = await stopOneDaemon({
            pidFilePath,
            metaFilePath,
            desiredFilePath,
            force: false,
            waitMs: 200,
        });
        expect(result.status).toBe('metaCorrupt');
        await expect(fs.access(pidFilePath)).resolves.toBeUndefined();
    });
});

describe('drainOrStopOneDaemon', () => {
    let dir: string;
    let pidFilePath: string;
    let metaFilePath: string;
    let desiredFilePath: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-drain-one-'));
        pidFilePath = path.join(dir, 'demo.global.daemon.pid');
        metaFilePath = path.join(dir, 'demo.global.daemon.meta.json');
        desiredFilePath = path.join(dir, 'demo.global.daemon.desired.json');
        await fs.writeFile(pidFilePath, String(process.pid), 'utf8');
        await writeJsonFile({
            filePath: desiredFilePath,
            data: { projectRoot: dir, daemonId: 'global', cronSetup: '*/5 * * * *' },
        });
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('returns draining without signaling when mid-run', async () => {
        await writeJsonFile({
            filePath: metaFilePath,
            data: {
                daemonId: 'global',
                cronSetup: '*/5 * * * *',
                workspaceStrategy: 'checkout',
                inFlightLumpCount: 2,
            },
        });
        const result = await drainOrStopOneDaemon({
            pidFilePath,
            metaFilePath,
            desiredFilePath,
            force: false,
            waitMs: 200,
        });
        expect(result).toEqual({ status: 'draining', pid: process.pid });
        await expect(fs.access(pidFilePath)).resolves.toBeUndefined();
        const desired = JSON.parse(await fs.readFile(desiredFilePath, 'utf8')) as { stopping?: true };
        expect(desired.stopping).toBe(true);
    });
});

describe('stopSupervisor', () => {
    let dir: string;
    let pidFilePath: string;
    let metaFilePath: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-stop-sup-'));
        pidFilePath = path.join(dir, 'demo.pid');
        metaFilePath = path.join(dir, 'demo.meta.json');
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('returns missing when there is no pid file', async () => {
        const result = await stopSupervisor({
            pidFilePath,
            metaFilePath,
            force: false,
            waitMs: 200,
        });
        expect(result.status).toBe('missing');
    });

    it('unlinks a stale pid file without reading daemon meta', async () => {
        await fs.writeFile(pidFilePath, '999999999', 'utf8');
        await fs.writeFile(metaFilePath, '{ not daemon meta', 'utf8');
        const result = await stopSupervisor({
            pidFilePath,
            metaFilePath,
            force: false,
            waitMs: 200,
        });
        expect(result.status).toBe('stale');
        await expect(fs.access(pidFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.access(metaFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
    });
});
