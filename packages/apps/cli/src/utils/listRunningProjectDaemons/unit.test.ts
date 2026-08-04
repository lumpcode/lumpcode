import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listRunningProjectDaemons } from './main';
import type { RunningDaemonInfo } from './main';

/** Post-implementation return shape: Record keyed by daemonId. */
type ListRunning = (input: {
    daemonsDir: string;
    projectName: string;
}) => Promise<
    | { success: true; data: Record<string, RunningDaemonInfo> }
    | { success: false; data: string }
>;

/**
 * daemon-id-and-filters L1–L7.
 * Skipped until listRunningProjectDaemons returns Record<daemonId, info>.
 */
describe('listRunningProjectDaemons (daemon-id-and-filters L*)', () => {
    let daemonsDir: string;
    const projectName = 'proj';
    const list = listRunningProjectDaemons as unknown as ListRunning;

    beforeEach(async () => {
        daemonsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-list-daemons-'));
    });

    afterEach(async () => {
        await fs.rm(daemonsDir, { recursive: true, force: true });
    });

    it('L1: empty dir → empty record', async () => {
        const result = await list({ daemonsDir, projectName });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({});
    });

    it('L2: new global path → key global', async () => {
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.global.daemon.pid`),
            String(process.pid),
            'utf8',
        );
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.global.daemon.meta.json`),
            JSON.stringify({ cronSetup: '*/5 * * * *', workspaceStrategy: 'worktree' }),
            'utf8',
        );
        const result = await list({ daemonsDir, projectName });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.global).toEqual({
            pid: process.pid,
            meta: 'ok',
            workspaceStrategy: 'worktree',
        });
        expect(Object.keys(result.data)).toEqual(['global']);
    });

    it('L3: legacy bare pid as global when .global. missing', async () => {
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.daemon.pid`),
            String(process.pid),
            'utf8',
        );
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.daemon.meta.json`),
            JSON.stringify({ cronSetup: '*/5 * * * *', workspaceStrategy: 'checkout' }),
            'utf8',
        );
        const result = await list({ daemonsDir, projectName });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.global).toEqual({
            pid: process.pid,
            meta: 'ok',
            workspaceStrategy: 'checkout',
        });
    });

    it('L4: prefer new .global. over legacy bare (single entry)', async () => {
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.daemon.pid`),
            String(process.pid),
            'utf8',
        );
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.daemon.meta.json`),
            JSON.stringify({ cronSetup: '*/5 * * * *', workspaceStrategy: 'checkout' }),
            'utf8',
        );
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.global.daemon.pid`),
            String(process.pid),
            'utf8',
        );
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.global.daemon.meta.json`),
            JSON.stringify({ cronSetup: '*/5 * * * *', workspaceStrategy: 'worktree' }),
            'utf8',
        );
        const result = await list({ daemonsDir, projectName });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(Object.keys(result.data)).toEqual(['global']);
        expect(result.data.global).toMatchObject({
            meta: 'ok',
            workspaceStrategy: 'worktree',
        });
    });

    it('L5: filtered daemon id', async () => {
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.agents.daemon.pid`),
            String(process.pid),
            'utf8',
        );
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.agents.daemon.meta.json`),
            JSON.stringify({ cronSetup: '*/5 * * * *', workspaceStrategy: 'worktree' }),
            'utf8',
        );
        const result = await list({ daemonsDir, projectName });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.agents).toEqual({
            pid: process.pid,
            meta: 'ok',
            workspaceStrategy: 'worktree',
        });
    });

    it('L6: multiple daemons', async () => {
        for (const id of ['global', 'agents', 'backlog-2']) {
            await fs.writeFile(
                path.join(daemonsDir, `${projectName}.${id}.daemon.pid`),
                String(process.pid),
                'utf8',
            );
            await fs.writeFile(
                path.join(daemonsDir, `${projectName}.${id}.daemon.meta.json`),
                JSON.stringify({ cronSetup: '*/5 * * * *', workspaceStrategy: 'worktree' }),
                'utf8',
            );
        }
        const result = await list({ daemonsDir, projectName });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(new Set(Object.keys(result.data))).toEqual(
            new Set(['global', 'agents', 'backlog-2']),
        );
    });

    it('L7: corrupt meta peer', async () => {
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.agents.daemon.pid`),
            String(process.pid),
            'utf8',
        );
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.agents.daemon.meta.json`),
            '{ not json',
            'utf8',
        );
        const result = await list({ daemonsDir, projectName });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.agents).toEqual({ pid: process.pid, meta: 'invalid' });
    });
});
