import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { noopLogger } from '../noopLogger';
import { spawnDetachedLumpcodeWithPidFile } from './main';

describe('spawnDetachedLumpcodeWithPidFile', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-spawn-pid-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('writes the pid file and stub meta after spawn', async () => {
        const pidFilePath = path.join(dir, 'demo.pid');
        const metaFilePath = path.join(dir, 'demo.meta.json');
        const logFilePath = path.join(dir, 'demo.log');
        const spawnFn = vi.fn(() => ({ pid: 4242, unref: vi.fn() })) as unknown as typeof nodeSpawn;
        const result = await spawnDetachedLumpcodeWithPidFile({
            extraArgs: ['start', '--foreground'],
            cwd: dir,
            logFilePath,
            pidFilePath,
            spawnFn,
            stubMeta: {
                filePath: metaFilePath,
                data: { daemonId: 'global', cronSetup: '*/5 * * * *', workspaceStrategy: 'checkout' },
            },
            logger: noopLogger,
        });
        expect(result.success).toBe(true);
        expect((await fs.readFile(pidFilePath, 'utf8')).trim()).toBe('4242');
        const meta = JSON.parse(await fs.readFile(metaFilePath, 'utf8')) as { daemonId: string };
        expect(meta.daemonId).toBe('global');
    });

    it('fails and does not overwrite a pid file held by another live process', async () => {
        const pidFilePath = path.join(dir, 'held.pid');
        const logFilePath = path.join(dir, 'held.log');
        await fs.writeFile(pidFilePath, String(process.pid), 'utf8');
        const spawnFn = vi.fn(() => ({ pid: 4242, unref: vi.fn() })) as unknown as typeof nodeSpawn;
        const result = await spawnDetachedLumpcodeWithPidFile({
            extraArgs: ['start', '--foreground'],
            cwd: dir,
            logFilePath,
            pidFilePath,
            spawnFn,
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/held by live pid/);
        expect((await fs.readFile(pidFilePath, 'utf8')).trim()).toBe(String(process.pid));
    });
});
