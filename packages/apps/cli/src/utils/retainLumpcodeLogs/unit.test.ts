import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { daemonSchedulerFiles } from '../daemonSchedulerFiles';
import { daemonsDirPath } from '../daemonsDirPath';
import { lumpHistoryFilePath } from '../lumpHistoryFilePath';
import { lumpTranscriptFilePath } from '../lumpTranscriptFilePath';
import { noopLogger } from '../noopLogger';
import { supervisorLogPath } from '../supervisorPaths';
import { retainLumpcodeLogs } from './main';

const DAY_MS = 24 * 60 * 60 * 1000;
const PROJECT_NAME = 'demo';

async function setMtime(filePath: string, ageDays: number): Promise<void> {
    const when = new Date(Date.now() - ageDays * DAY_MS);
    await fs.utimes(filePath, when, when);
}

describe('retainLumpcodeLogs', () => {
    let projectRoot: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        ({ projectRoot, globalConfigFolderPath } = await createTempTestDirs({
            prefix: 'lump-retain-',
        }));
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, globalConfigFolderPath });
        vi.restoreAllMocks();
    });

    function input(overrides: { maxAgeDays?: number } = {}) {
        return {
            projectRoot,
            projectName: PROJECT_NAME,
            globalConfigFolderPath,
            logger: noopLogger,
            ...overrides,
        };
    }

    async function writeTranscript(opts: {
        lumpName: string;
        discoveryBranch: string;
        ageDays: number;
    }): Promise<string> {
        const pathResult = lumpTranscriptFilePath({
            projectRoot,
            lumpName: opts.lumpName,
            discoveryBranch: opts.discoveryBranch,
            tickStartedAt: '2026-01-01T00:00:00.000Z',
        });
        expect(pathResult.success).toBe(true);
        if (!pathResult.success) throw new Error('unreachable');
        await fs.mkdir(path.dirname(pathResult.data), { recursive: true });
        await fs.writeFile(pathResult.data, 'session\n', 'utf8');
        await setMtime(pathResult.data, opts.ageDays);
        return pathResult.data;
    }

    async function writeHistory(opts: {
        lumpName: string;
        contextName: string;
        ageDays: number;
    }): Promise<string> {
        const filePath = lumpHistoryFilePath({
            projectRoot,
            lumpName: opts.lumpName,
            contextName: opts.contextName,
        });
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, '[]\n', 'utf8');
        await setMtime(filePath, opts.ageDays);
        return filePath;
    }

    it('deletes transcript and history files older than 14 days and keeps fresher ones', async () => {
        const oldTranscript = await writeTranscript({
            lumpName: 'alpha',
            discoveryBranch: 'dev',
            ageDays: 15,
        });
        const freshTranscript = await writeTranscript({
            lumpName: 'alpha',
            discoveryBranch: 'main',
            ageDays: 1,
        });
        const oldHistory = await writeHistory({
            lumpName: 'alpha',
            contextName: 'oldCtx',
            ageDays: 20,
        });
        const freshHistory = await writeHistory({
            lumpName: 'alpha',
            contextName: 'newCtx',
            ageDays: 2,
        });

        const result = await retainLumpcodeLogs(input());
        expect(result.success).toBe(true);

        await expect(fs.access(oldTranscript)).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.access(freshTranscript)).resolves.toBeUndefined();
        await expect(fs.access(oldHistory)).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.access(freshHistory)).resolves.toBeUndefined();
        await expect(
            fs.stat(path.dirname(oldHistory)),
        ).resolves.toMatchObject({ isDirectory: expect.any(Function) });
        expect((await fs.stat(path.dirname(oldHistory))).isDirectory()).toBe(true);
    });

    it('treats omitted maxAgeDays as 14 days', async () => {
        const oldTranscript = await writeTranscript({
            lumpName: 'beta',
            discoveryBranch: 'dev',
            ageDays: 15,
        });
        const borderline = await writeTranscript({
            lumpName: 'beta',
            discoveryBranch: 'main',
            ageDays: 13,
        });

        const result = await retainLumpcodeLogs(input());
        expect(result.success).toBe(true);
        await expect(fs.access(oldTranscript)).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.access(borderline)).resolves.toBeUndefined();
    });

    it('maxAgeDays 0 deletes and trims nothing', async () => {
        const oldTranscript = await writeTranscript({
            lumpName: 'gamma',
            discoveryBranch: 'dev',
            ageDays: 40,
        });
        const oldHistory = await writeHistory({
            lumpName: 'gamma',
            contextName: 'ctx',
            ageDays: 40,
        });
        const daemonsDir = daemonsDirPath({ globalConfigFolderPath });
        const { logFilePath } = daemonSchedulerFiles({
            daemonsDir,
            projectName: PROJECT_NAME,
            daemonId: 'global',
        });
        await fs.mkdir(daemonsDir, { recursive: true });
        const oldLog = '2020-01-01T00:00:00.000Z ancient\n';
        await fs.writeFile(logFilePath, oldLog, 'utf8');

        const result = await retainLumpcodeLogs(input({ maxAgeDays: 0 }));
        expect(result.success).toBe(true);
        await expect(fs.access(oldTranscript)).resolves.toBeUndefined();
        await expect(fs.access(oldHistory)).resolves.toBeUndefined();
        expect(await fs.readFile(logFilePath, 'utf8')).toBe(oldLog);
    });

    it('succeeds when transcripts, history, and daemon dirs are missing', async () => {
        const result = await retainLumpcodeLogs(input({ maxAgeDays: 7 }));
        expect(result.success).toBe(true);
    });

    it('trims daemon and supervisor logs in place without unlinking', async () => {
        const daemonsDir = daemonsDirPath({ globalConfigFolderPath });
        const { logFilePath } = daemonSchedulerFiles({
            daemonsDir,
            projectName: PROJECT_NAME,
            daemonId: 'global',
        });
        const supervisorPath = supervisorLogPath({
            globalConfigFolderPath,
            projectName: PROJECT_NAME,
        });
        await fs.mkdir(daemonsDir, { recursive: true });
        await fs.mkdir(path.dirname(supervisorPath), { recursive: true });

        const contents = [
            '2020-01-01T00:00:00.000Z old line',
            'untimestamped stays',
            `${new Date().toISOString()} recent line`,
            '',
        ].join('\n');
        await fs.writeFile(logFilePath, contents, 'utf8');
        await fs.writeFile(supervisorPath, contents, 'utf8');
        const before = await fs.stat(logFilePath);

        const result = await retainLumpcodeLogs(input({ maxAgeDays: 14 }));
        expect(result.success).toBe(true);

        const after = await fs.stat(logFilePath);
        expect(after.ino).toBe(before.ino);
        await expect(fs.access(logFilePath)).resolves.toBeUndefined();
        await expect(fs.access(supervisorPath)).resolves.toBeUndefined();

        const kept = await fs.readFile(logFilePath, 'utf8');
        expect(kept).not.toContain('old line');
        expect(kept).toContain('untimestamped stays');
        expect(kept).toContain('recent line');
        expect(await fs.readFile(supervisorPath, 'utf8')).toBe(kept);
    });

    it('does not trim another project\'s daemon log', async () => {
        const daemonsDir = daemonsDirPath({ globalConfigFolderPath });
        const otherLog = daemonSchedulerFiles({
            daemonsDir,
            projectName: 'other',
            daemonId: 'global',
        }).logFilePath;
        await fs.mkdir(daemonsDir, { recursive: true });
        const otherContents = '2020-01-01T00:00:00.000Z other-old\n';
        await fs.writeFile(otherLog, otherContents, 'utf8');

        const result = await retainLumpcodeLogs(input({ maxAgeDays: 1 }));
        expect(result.success).toBe(true);
        expect(await fs.readFile(otherLog, 'utf8')).toBe(otherContents);
    });
});
