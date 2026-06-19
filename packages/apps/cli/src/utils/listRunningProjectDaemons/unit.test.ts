import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listRunningProjectDaemons } from './main';

describe('listRunningProjectDaemons', () => {
    let daemonsDir: string;
    const projectName = 'my-project';

    beforeEach(async () => {
        daemonsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-list-daemons-'));
    });

    afterEach(async () => {
        await fs.rm(daemonsDir, { recursive: true, force: true });
    });

    it('returns success with empty lumps when no daemons are running', async () => {
        const result = await listRunningProjectDaemons({ daemonsDir, projectName });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({ lumps: {} });
    });

    it('detects a running global daemon with workspaceStrategy from meta', async () => {
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.daemon.pid`),
            String(process.pid),
            'utf8',
        );
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.daemon.meta.json`),
            JSON.stringify({ cronSetup: '*/5 * * * *', workspaceStrategy: 'worktree' }),
            'utf8',
        );
        const result = await listRunningProjectDaemons({ daemonsDir, projectName });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.global).toEqual({ pid: process.pid, workspaceStrategy: 'worktree' });
        expect(result.data.lumps).toEqual({});
    });

    it('defaults workspaceStrategy to checkout when meta is missing', async () => {
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.alpha.daemon.pid`),
            String(process.pid),
            'utf8',
        );
        const result = await listRunningProjectDaemons({ daemonsDir, projectName });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.lumps).toEqual({ alpha: { pid: process.pid, workspaceStrategy: 'checkout' } }); // TODO : remove this behavior, if no meta, fail with error
    });
});
