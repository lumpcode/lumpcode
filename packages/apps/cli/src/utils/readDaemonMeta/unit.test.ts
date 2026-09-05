import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeJsonFile } from '../writeJsonFile';
import { readDaemonMeta } from './main';

describe('readDaemonMeta', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-read-daemon-meta-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('fails with reason missing when the meta file is absent', async () => {
        const result = await readDaemonMeta(path.join(dir, 'missing.meta.json'));
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.reason).toBe('missing');
        expect(result.data.message).toMatch(/not found/i);
    });

    it('fails with reason invalid when JSON is corrupt', async () => {
        const metaPath = path.join(dir, 'bad.meta.json');
        await fs.writeFile(metaPath, '{ not json', 'utf8');
        const result = await readDaemonMeta(metaPath);
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.reason).toBe('invalid');
    });

    it('defaults workspaceStrategy to checkout when omitted from a valid meta object', async () => {
        const metaPath = path.join(dir, 'no-strategy.meta.json');
        await writeJsonFile({ filePath: metaPath, data: { cronSetup: '*/5 * * * *' } });
        const result = await readDaemonMeta(metaPath);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.workspaceStrategy).toBe('checkout');
        expect(result.data.cronSetup).toBe('*/5 * * * *');
    });

    it('reads workspaceStrategy and cronSetup from meta', async () => {
        const metaPath = path.join(dir, 'demo.meta.json');
        await writeJsonFile({ filePath: metaPath, data: { cronSetup: '*/7 * * * *', workspaceStrategy: 'worktree', lumpName: 'alpha' } });
        const result = await readDaemonMeta(metaPath);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({
            cronSetup: '*/7 * * * *',
            workspaceStrategy: 'worktree',
            lumpName: 'alpha',
        });
    });

    it('reads busy: true from meta', async () => {
        const metaPath = path.join(dir, 'busy-true.meta.json');
        await writeJsonFile({
            filePath: metaPath,
            data: {
                cronSetup: '*/5 * * * *',
                workspaceStrategy: 'checkout',
                busy: true,
            },
        });
        const result = await readDaemonMeta(metaPath);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.busy).toBe(true);
        expect(result.data.cronSetup).toBe('*/5 * * * *');
        expect(result.data.workspaceStrategy).toBe('checkout');
    });

    it('reads busy: false from meta', async () => {
        const metaPath = path.join(dir, 'busy-false.meta.json');
        await writeJsonFile({
            filePath: metaPath,
            data: {
                cronSetup: '*/5 * * * *',
                workspaceStrategy: 'checkout',
                busy: false,
            },
        });
        const result = await readDaemonMeta(metaPath);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.busy).toBe(false);
    });

    it('omits busy when absent from meta', async () => {
        const metaPath = path.join(dir, 'idle.meta.json');
        await writeJsonFile({
            filePath: metaPath,
            data: {
                cronSetup: '*/5 * * * *',
                workspaceStrategy: 'checkout',
            },
        });
        const result = await readDaemonMeta(metaPath);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.busy).toBeUndefined();
    });

    it('strips unknown child-pid keys from meta', async () => {
        const metaPath = path.join(dir, 'agent-pid.meta.json');
        await writeJsonFile({
            filePath: metaPath,
            data: {
                cronSetup: '*/5 * * * *',
                workspaceStrategy: 'checkout',
                agentPid: 12345,
                childPids: [1, 2, 3],
            },
        });
        const result = await readDaemonMeta(metaPath);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({
            cronSetup: '*/5 * * * *',
            workspaceStrategy: 'checkout',
        });
        expect('agentPid' in result.data).toBe(false);
        expect('childPids' in result.data).toBe(false);
    });

    describe('inFlightLumpCount (parallel-global-daemon-worktree M6–M7)', () => {
        it('M6: reads inFlightLumpCount from meta', async () => {
            const metaPath = path.join(dir, 'in-flight.meta.json');
            await writeJsonFile({
                filePath: metaPath,
                data: {
                    cronSetup: '*/5 * * * *',
                    workspaceStrategy: 'worktree',
                    inFlightLumpCount: 2,
                },
            });
            const result = await readDaemonMeta(metaPath);
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.inFlightLumpCount).toBe(2);
            expect(result.data.cronSetup).toBe('*/5 * * * *');
            expect(result.data.workspaceStrategy).toBe('worktree');
        });

        it('M7: legacy busy: true remains readable without count', async () => {
            const metaPath = path.join(dir, 'legacy-busy.meta.json');
            await writeJsonFile({
                filePath: metaPath,
                data: {
                    cronSetup: '*/5 * * * *',
                    workspaceStrategy: 'checkout',
                    busy: true,
                },
            });
            const result = await readDaemonMeta(metaPath);
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.busy).toBe(true);
            expect(result.data.inFlightLumpCount).toBeUndefined();
        });
    });

    it('round-trips optional daemonConfigFile meta', async () => {
        const metaPath = path.join(dir, 'file-launched.meta.json');
        const daemonConfigFile = {
            hash: 'deadbeef'.repeat(8),
            discoveryBranch: 'feat/team-a',
            path: '.lumpcode/daemons/nightly.json',
        };
        await writeJsonFile({
            filePath: metaPath,
            data: {
                daemonId: 'nightly',
                cronSetup: '*/5 * * * *',
                workspaceStrategy: 'worktree',
                daemonConfigFile,
            },
        });
        const result = await readDaemonMeta(metaPath);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.daemonConfigFile).toEqual(daemonConfigFile);
        expect(result.data.daemonId).toBe('nightly');
    });

    it('omits daemonConfigFile when absent (CLI start metas)', async () => {
        const metaPath = path.join(dir, 'cli-start.meta.json');
        await writeJsonFile({
            filePath: metaPath,
            data: {
                daemonId: 'global',
                cronSetup: '*/5 * * * *',
                workspaceStrategy: 'checkout',
            },
        });
        const result = await readDaemonMeta(metaPath);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.daemonConfigFile).toBeUndefined();
    });

    it('fails invalid when daemonConfigFile is present but incomplete', async () => {
        const metaPath = path.join(dir, 'bad-file-meta.meta.json');
        await writeJsonFile({
            filePath: metaPath,
            data: {
                cronSetup: '*/5 * * * *',
                workspaceStrategy: 'checkout',
                daemonConfigFile: { hash: 'abc' },
            },
        });
        const result = await readDaemonMeta(metaPath);
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.reason).toBe('invalid');
    });
});
