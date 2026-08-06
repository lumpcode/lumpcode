import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { formatJsonFileContent, writeJsonFile } from './main';

describe('formatJsonFileContent', () => {
    it('matches what writeJsonFile would write for the same options', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'write-json-file-'));
        const filePath = join(dir, 'data.json');
        const data = { a: 1, b: 'two' };
        const options = { data, pretty: 2 as const, trailingNewline: true };

        const result = await writeJsonFile({ filePath, ...options });
        expect(result.success).toBe(true);

        const onDisk = await readFile(filePath, 'utf-8');
        expect(onDisk).toBe(formatJsonFileContent(options));
    });
});

describe('writeJsonFile', () => {
    it('writes compact JSON by default', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'write-json-file-'));
        const filePath = join(dir, 'compact.json');

        const result = await writeJsonFile({ filePath, data: { a: 1 } });
        expect(result.success).toBe(true);
        expect(await readFile(filePath, 'utf-8')).toBe('{"a":1}');
    });

    it('pretty: true / pretty: 2 produces indented output', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'write-json-file-'));
        const truePath = join(dir, 'pretty-true.json');
        const twoPath = join(dir, 'pretty-2.json');
        const data = { a: 1 };

        expect((await writeJsonFile({ filePath: truePath, data, pretty: true })).success).toBe(true);
        expect((await writeJsonFile({ filePath: twoPath, data, pretty: 2 })).success).toBe(true);

        const expected = JSON.stringify(data, null, 2);
        expect(await readFile(truePath, 'utf-8')).toBe(expected);
        expect(await readFile(twoPath, 'utf-8')).toBe(expected);
    });

    it('trailingNewline: true appends exactly one \\n', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'write-json-file-'));
        const filePath = join(dir, 'newline.json');

        const result = await writeJsonFile({
            filePath,
            data: { ok: true },
            trailingNewline: true,
        });
        expect(result.success).toBe(true);
        expect(await readFile(filePath, 'utf-8')).toBe('{"ok":true}\n');
    });

    it('mkdir: true creates missing parent directories', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'write-json-file-'));
        const filePath = join(dir, 'nested', 'deep', 'file.json');

        const result = await writeJsonFile({
            filePath,
            data: { nested: true },
            mkdir: true,
        });
        expect(result.success).toBe(true);
        expect(await readFile(filePath, 'utf-8')).toBe('{"nested":true}');
    });

    it('mode is forwarded to fs.writeFile when set', async () => {
        if (process.platform === 'win32') return;

        const dir = await mkdtemp(join(tmpdir(), 'write-json-file-'));
        const filePath = join(dir, 'mode.json');

        const result = await writeJsonFile({
            filePath,
            data: { secret: true },
            mode: 0o600,
        });
        expect(result.success).toBe(true);
        const mode = (await stat(filePath)).mode & 0o777;
        expect(mode).toBe(0o600);
    });

    it('returns failure when the parent path is missing and mkdir is not set', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'write-json-file-'));
        const filePath = join(dir, 'missing-parent', 'file.json');

        const result = await writeJsonFile({ filePath, data: { a: 1 } });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data).toContain(`Cannot write ${filePath}`);
        }
    });
});
