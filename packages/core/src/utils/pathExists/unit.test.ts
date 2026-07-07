import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { pathExists } from './main';

describe('pathExists', () => {
    it('returns true when the path exists', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'path-exists-'));
        const filePath = join(dir, 'present.txt');
        await writeFile(filePath, 'ok', 'utf8');

        expect(await pathExists(filePath)).toBe(true);
        expect(await pathExists(dir)).toBe(true);
    });

    it('returns false when the path is missing', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'path-exists-'));
        expect(await pathExists(join(dir, 'missing.txt'))).toBe(false);
    });
});
