import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { daemonSchedulerFiles, listDaemonIds, legacyGlobalDaemonSchedulerFiles, unlinkSchedulerFiles } from './main';

describe('daemonSchedulerFiles', () => {
    it('assembles pid/meta/log/desired paths for a daemon id', () => {
        expect(daemonSchedulerFiles({ daemonsDir: '/d', projectName: 'demo', daemonId: 'agents' })).toEqual({
            pidFilePath: path.join('/d', 'demo.agents.daemon.pid'),
            metaFilePath: path.join('/d', 'demo.agents.daemon.meta.json'),
            logFilePath: path.join('/d', 'demo.agents.daemon.log'),
            desiredFilePath: path.join('/d', 'demo.agents.daemon.desired.json'),
        });
    });
});

describe('listDaemonIds', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-list-ids-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('returns an empty list when the directory is missing', async () => {
        const result = await listDaemonIds({
            dir: path.join(dir, 'missing'),
            projectName: 'demo',
            kind: 'pid',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual([]);
    });

    it('captures ids for a kind and ignores other projects', async () => {
        await fs.writeFile(path.join(dir, 'demo.global.daemon.pid'), '1', 'utf8');
        await fs.writeFile(path.join(dir, 'demo.agents.daemon.pid'), '2', 'utf8');
        await fs.writeFile(path.join(dir, 'other.global.daemon.pid'), '3', 'utf8');
        await fs.writeFile(path.join(dir, 'demo.global.daemon.desired.json'), '{}', 'utf8');
        const pidResult = await listDaemonIds({
            dir,
            projectName: 'demo',
            kind: 'pid',
        });
        expect(pidResult.success).toBe(true);
        if (!pidResult.success) throw new Error('unreachable');
        expect(pidResult.data.sort()).toEqual(['agents', 'global']);

        const desiredResult = await listDaemonIds({
            dir,
            projectName: 'demo',
            kind: 'desired',
        });
        expect(desiredResult.success).toBe(true);
        if (!desiredResult.success) throw new Error('unreachable');
        expect(desiredResult.data).toEqual(['global']);
    });
});

describe('legacyGlobalDaemonSchedulerFiles', () => {
    it('uses the bare project basename', () => {
        expect(legacyGlobalDaemonSchedulerFiles({ daemonsDir: '/d', projectName: 'demo' })).toEqual({
            pidFilePath: path.join('/d', 'demo.daemon.pid'),
            metaFilePath: path.join('/d', 'demo.daemon.meta.json'),
            logFilePath: path.join('/d', 'demo.daemon.log'),
            desiredFilePath: path.join('/d', 'demo.daemon.desired.json'),
        });
    });
});

describe('unlinkSchedulerFiles', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-unlink-sched-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('unlinks present files and ignores missing ones', async () => {
        const files = daemonSchedulerFiles({ daemonsDir: dir, projectName: 'demo', daemonId: 'global' });
        await fs.writeFile(files.pidFilePath, '1', 'utf8');
        await fs.writeFile(files.metaFilePath, '{}', 'utf8');
        await fs.writeFile(files.desiredFilePath, '{}', 'utf8');
        await unlinkSchedulerFiles({
            ...files,
            logFilePath: path.join(dir, 'missing.log'),
        });
        await expect(fs.access(files.pidFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.access(files.metaFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.access(files.desiredFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
    });
});
