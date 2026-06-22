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
});

describe('writeHistoryFile and readHistoryFile round trip', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'history-file-roundtrip-'));
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
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
});
