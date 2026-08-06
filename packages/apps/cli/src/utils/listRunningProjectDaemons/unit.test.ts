import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listRunningProjectDaemons } from './main';
import { writeJsonFile } from '../writeJsonFile';

describe('listRunningProjectDaemons', () => {
    let daemonsDir: string;
    const projectName = 'my-project';

    beforeEach(async () => {
        daemonsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-list-daemons-'));
    });

    afterEach(async () => {
        await fs.rm(daemonsDir, { recursive: true, force: true });
    });

    it('returns empty map when no daemons are running', async () => {
        const result = await listRunningProjectDaemons({ daemonsDir, projectName });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({});
    });

    it('detects a running global daemon at new-style path', async () => {
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.global.daemon.pid`),
            String(process.pid),
            'utf8',
        );
        await writeJsonFile({
            filePath: path.join(daemonsDir, `${projectName}.global.daemon.meta.json`),
            data: {
                daemonId: 'global',
                cronSetup: '*/5 * * * *',
                workspaceStrategy: 'worktree',
            },
        });
        const result = await listRunningProjectDaemons({ daemonsDir, projectName });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.global).toEqual({
            pid: process.pid,
            meta: 'ok',
            workspaceStrategy: 'worktree',
        });
    });

    it('maps legacy bare global pid to id global', async () => {
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.daemon.pid`),
            String(process.pid),
            'utf8',
        );
        await writeJsonFile({
            filePath: path.join(daemonsDir, `${projectName}.daemon.meta.json`),
            data: { cronSetup: '*/5 * * * *', workspaceStrategy: 'checkout' },
        });
        const result = await listRunningProjectDaemons({ daemonsDir, projectName });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.global).toEqual({
            pid: process.pid,
            meta: 'ok',
            workspaceStrategy: 'checkout',
        });
    });

    it('marks alive daemon as meta missing when meta file is absent', async () => {
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.alpha.daemon.pid`),
            String(process.pid),
            'utf8',
        );
        const result = await listRunningProjectDaemons({ daemonsDir, projectName });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({ alpha: { pid: process.pid, meta: 'missing' } });
    });
});
