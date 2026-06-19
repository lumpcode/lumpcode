import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readDaemonPidIfAlive } from './main';

describe('readDaemonPidIfAlive', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-read-daemon-pid-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('returns success(undefined) when the PID file is missing', async () => {
        const result = await readDaemonPidIfAlive(path.join(dir, 'missing.pid'));
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toBeUndefined();
    });

    it('returns success({ stale: true }) when the PID file is not a number', async () => {
        const pidPath = path.join(dir, 'bad.pid');
        await fs.writeFile(pidPath, 'not-a-pid', 'utf8');
        const result = await readDaemonPidIfAlive(pidPath);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({ stale: true });
    });

    it('returns success({ pid }) for the current process', async () => {
        const pidPath = path.join(dir, 'alive.pid');
        await fs.writeFile(pidPath, String(process.pid), 'utf8');
        const result = await readDaemonPidIfAlive(pidPath);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({ pid: process.pid });
    });

    it('returns success({ stale: true }) when the process does not exist', async () => {
        const pidPath = path.join(dir, 'gone.pid');
        await fs.writeFile(pidPath, '999999999', 'utf8');
        const result = await readDaemonPidIfAlive(pidPath);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({ stale: true });
    });
});
