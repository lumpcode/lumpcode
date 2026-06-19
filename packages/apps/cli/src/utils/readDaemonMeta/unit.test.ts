import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readDaemonMeta } from './main';

describe('readDaemonMeta', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-read-daemon-meta-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('defaults to checkout when the meta file is missing', async () => {
        const result = await readDaemonMeta(path.join(dir, 'missing.meta.json'));
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({ workspaceStrategy: 'checkout' }); // TODO : fail with error if it is missing
    });

    it('reads workspaceStrategy and cronSetup from meta', async () => {
        const metaPath = path.join(dir, 'demo.meta.json');
        await fs.writeFile(
            metaPath,
            JSON.stringify({ cronSetup: '*/7 * * * *', workspaceStrategy: 'worktree', lumpName: 'alpha' }),
            'utf8',
        );
        const result = await readDaemonMeta(metaPath);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({
            cronSetup: '*/7 * * * *',
            workspaceStrategy: 'worktree',
            lumpName: 'alpha',
        });
    });
});
