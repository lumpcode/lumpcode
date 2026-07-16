import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
    appendHistoryEntry,
    historyFormatFromPath,
    readHistoryFile,
    writeHistoryFile,
} from './main';
import type { HistoryEntry } from '../../types/HistoryEntry';

function assertSuccess<T>(result: { success: true; data: T } | { success: false; data: string }): T {
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    return result.data;
}

function assertFailure(
    result: { success: true; data: unknown } | { success: false; data: string },
    expectedSubstring: string,
): void {
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect(result.data).toContain(expectedSubstring);
}

describe('historyFormatFromPath', () => {
    it('returns yaml for .yaml paths', () => {
        expect(assertSuccess(historyFormatFromPath('a.yaml'))).toBe('yaml');
    });

    it('returns yaml for .yml paths', () => {
        expect(assertSuccess(historyFormatFromPath('a.yml'))).toBe('yaml');
    });

    it('returns yaml for .YML paths (case-insensitive extension)', () => {
        expect(assertSuccess(historyFormatFromPath('a.YML'))).toBe('yaml');
    });

    it('fails for .json paths', () => {
        assertFailure(historyFormatFromPath('a.json'), 'a.json');
    });

    it('fails for unsupported extensions', () => {
        assertFailure(historyFormatFromPath('a.txt'), 'a.txt');
    });
});

describe('readHistoryFile', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'history-file-read-'));
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('returns an empty array for an empty YAML sequence', async () => {
        const filePath = join(tmpDir, 'empty.yaml');
        await writeFile(filePath, '[]\n', 'utf-8');

        const entries = assertSuccess(await readHistoryFile({ filePath }));
        expect(entries).toEqual([]);
    });

    it('fails with the file path when YAML is invalid', async () => {
        const filePath = join(tmpDir, 'broken.yaml');
        await writeFile(filePath, '{{invalid', 'utf-8');

        assertFailure(await readHistoryFile({ filePath }), filePath);
    });

    it('parses a file containing ANSI escapes in literal blocks', async () => {
        const filePath = join(tmpDir, 'ansi-on-disk.yaml');
        const corruptYaml = [
            '- commandResult: |-',
            '    line1',
            '    \x1b[32mcolored\x1b[0m',
            '    line3',
            '  commandSucceeded: true',
            '  context:',
            '    name: ctx',
            '    variables: {}',
            '  prompt: ok',
            '  stepIndex: 0',
            '  contextRunState: {}',
            '  lumpVariables: {}',
            '  projectRoot: /tmp',
            '',
        ].join('\n');
        await writeFile(filePath, corruptYaml, 'utf-8');

        const entries = assertSuccess(await readHistoryFile({ filePath }));
        expect(entries).toHaveLength(1);
        expect(entries[0]?.commandResult).toBe('line1\ncolored\nline3');
    });
});

describe('writeHistoryFile and readHistoryFile round trip', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'history-file-roundtrip-'));
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('strips ANSI escapes from multiline commandResult so read round-trips', async () => {
        const filePath = join(tmpDir, 'ansi.yaml');
        const entries: HistoryEntry[] = [{
            commandSucceeded: true,
            prompt: 'run build',
            commandResult: 'line1\n\x1b[32mcolored\x1b[0m\nline3',
            context: { name: 'ctx', variables: {} },
            stepIndex: 0,
            contextRunState: {},
            lumpVariables: {},
            projectRoot: tmpDir,
        }];

        assertSuccess(await writeHistoryFile({ filePath, entries }));
        const roundTripped = assertSuccess(await readHistoryFile({ filePath }));
        expect(roundTripped).toHaveLength(1);
        expect(roundTripped[0]?.commandResult).toBe('line1\ncolored\nline3');

        const raw = await readFile(filePath, 'utf-8');
        expect(raw).not.toContain('\x1b');
    });

    it('deep-equals entries and uses block scalars for multiline strings', async () => {
        const filePath = join(tmpDir, 'history.yaml');
        const entries: HistoryEntry[] = [{
            commandSucceeded: true,
            prompt: 'Refactor src/Button.tsx…\nFocus on keyboard navigation.',
            commandResult: 'Updated Button.tsx\nAdded tabIndex.',
            context: { name: 'button', variables: { FILE: 'src/Button.tsx' } },
            stepIndex: 0,
            contextRunState: { copilotSetup: { setupChatId: 'a1b2' } },
            lumpVariables: {},
            projectRoot: tmpDir,
        }];

        assertSuccess(await writeHistoryFile({ filePath, entries }));
        const roundTripped = assertSuccess(await readHistoryFile({ filePath }));
        expect(roundTripped).toEqual(entries);

        const raw = await readFile(filePath, 'utf-8');
        expect(raw).toMatch(/prompt: \|/);
        expect(raw).toMatch(/commandResult: \|/);
        expect(raw).not.toMatch(/Focus on keyboard navigation\\n/);
    });
});

describe('appendHistoryEntry', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'history-file-append-'));
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('creates parent directories and writes the first entry on a missing path', async () => {
        const filePath = join(tmpDir, 'nested', 'dir', 'ctx.yaml');
        const entry: HistoryEntry = {
            commandSucceeded: true,
            prompt: 'first',
            commandResult: 'ok',
            context: { name: 'ctx', variables: {} },
            stepIndex: 0,
            contextRunState: {},
            lumpVariables: {},
            projectRoot: tmpDir,
        };

        assertSuccess(await appendHistoryEntry({ filePath, entry }));
        const entries = assertSuccess(await readHistoryFile({ filePath }));
        expect(entries).toHaveLength(1);
        expect(entries[0]).toEqual(entry);
    });

    it('fails with the file path when appending to invalid YAML', async () => {
        const filePath = join(tmpDir, 'broken.yaml');
        await writeFile(filePath, '{{invalid', 'utf-8');

        const entry: HistoryEntry = {
            commandSucceeded: true,
            prompt: 'next',
            commandResult: 'ok',
            context: { name: 'ctx', variables: {} },
            stepIndex: 0,
            contextRunState: {},
            lumpVariables: {},
            projectRoot: tmpDir,
        };

        assertFailure(await appendHistoryEntry({ filePath, entry }), filePath);
    });

    it('appends to a file with ANSI escapes and rewrites clean YAML', async () => {
        const filePath = join(tmpDir, 'ansi-append.yaml');
        const corruptYaml = [
            '- commandResult: ok',
            '  commandSucceeded: true',
            '  context:',
            '    name: ctx',
            '    variables: {}',
            '  prompt: first',
            '  stepIndex: 0',
            '  contextRunState: {}',
            '  lumpVariables: {}',
            '  projectRoot: /tmp',
            '',
        ].join('\n').replace('ok', 'ok\n    \x1b[31mfail\x1b[0m');
        await writeFile(filePath, corruptYaml, 'utf-8');

        const entry: HistoryEntry = {
            commandSucceeded: true,
            prompt: 'second',
            commandResult: 'next',
            context: { name: 'ctx', variables: {} },
            stepIndex: 1,
            contextRunState: {},
            lumpVariables: {},
            projectRoot: tmpDir,
        };

        assertSuccess(await appendHistoryEntry({ filePath, entry }));
        const entries = assertSuccess(await readHistoryFile({ filePath }));
        expect(entries).toHaveLength(2);
        expect(entries[1]?.prompt).toBe('second');

        const raw = await readFile(filePath, 'utf-8');
        expect(raw).not.toContain('\x1b');
    });
});
