import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendMissingGitignoreLines } from './main';

describe('appendMissingGitignoreLines', () => {
    it('creates or appends only missing trimmed lines', async () => {
        const projectRoot = await mkdtemp(join(tmpdir(), 'gitignore-'));
        expect((await appendMissingGitignoreLines({ projectRoot, lines: ['.lumpcode/.cache/'] })).success).toBe(true);
        expect(await readFile(join(projectRoot, '.gitignore'), 'utf-8')).toBe('.lumpcode/.cache/\n');
        await writeFile(join(projectRoot, '.gitignore'), 'existing\n', 'utf-8');
        expect((await appendMissingGitignoreLines({ projectRoot, lines: ['existing', '.lumpcode/local.json'] })).success).toBe(true);
        expect(await readFile(join(projectRoot, '.gitignore'), 'utf-8')).toBe('existing\n.lumpcode/local.json\n');
    });
});
