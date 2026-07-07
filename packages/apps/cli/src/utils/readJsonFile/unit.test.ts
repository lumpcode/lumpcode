import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readJsonFile } from './main';

describe('readJsonFile', () => {
    it('parses valid JSON', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'read-json-file-'));
        const filePath = join(dir, 'data.json');
        await writeFile(filePath, '{"a":1}\n', 'utf8');

        const result = await readJsonFile<{ a: number }>({ filePath });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({ a: 1 });
        }
    });

    it('returns custom failure when the file is missing and ifMissing is fail', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'read-json-file-'));
        const filePath = join(dir, 'missing.json');

        const result = await readJsonFile({
            filePath,
            missingFileFailure: 'custom missing message',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data).toBe('custom missing message');
        }
    });

    it('returns undefined when the file is missing and ifMissing is undefined', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'read-json-file-'));
        const filePath = join(dir, 'missing.json');

        const result = await readJsonFile({ filePath, ifMissing: 'undefined' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toBeUndefined();
        }
    });

    it('returns defaultValue when the file is missing', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'read-json-file-'));
        const filePath = join(dir, 'missing.json');
        const defaultValue = { ok: true };

        const result = await readJsonFile({
            filePath,
            ifMissing: { defaultValue },
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual(defaultValue);
        }
    });

    it('fails on invalid JSON', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'read-json-file-'));
        const filePath = join(dir, 'bad.json');
        await writeFile(filePath, '{not json', 'utf8');

        const result = await readJsonFile({ filePath });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data).toContain('Invalid JSON');
        }
    });
});
