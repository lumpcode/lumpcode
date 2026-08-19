import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { unlinkBestEffort } from './main';

describe('unlinkBestEffort', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-unlink-best-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('unlinks present files and ignores missing or omitted paths', async () => {
        const keep = path.join(dir, 'keep.txt');
        const gone = path.join(dir, 'gone.txt');
        await fs.writeFile(keep, '1', 'utf8');
        await fs.writeFile(gone, '2', 'utf8');
        await unlinkBestEffort([gone, path.join(dir, 'missing.txt'), undefined]);
        await expect(fs.access(keep)).resolves.toBeUndefined();
        await expect(fs.access(gone)).rejects.toMatchObject({ code: 'ENOENT' });
    });
});
