import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import {
    listLumpTranscriptFiles,
    lumpTranscriptFilePath,
    prepareLumpTranscriptFile,
    resolveLumpTranscriptFile,
    TRANSCRIPTS_GITIGNORE_LINE,
} from './main';

describe('lumpTranscriptFilePath', () => {
    it('places the log under branch segments with a colon-free stamp', () => {
        const result = lumpTranscriptFilePath({
            projectRoot: '/tmp/project',
            lumpName: 'myLump',
            discoveryBranch: 'feature/foo',
            tickStartedAt: '2026-10-16T07:28:00.000Z',
        });
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toBe(path.join(
            '/tmp/project',
            '.lumpcode',
            'lumps',
            'myLump',
            'transcripts',
            'feature',
            'foo',
            '2026-10-16T07-28-00.000Z.log',
        ));
    });

    it.each(['.', '..', 'feature//foo', 'feature/', '/feature'])(
        'rejects branch %j',
        (discoveryBranch) => {
            const result = lumpTranscriptFilePath({
                projectRoot: '/tmp/project',
                lumpName: 'myLump',
                discoveryBranch,
                tickStartedAt: '2026-10-16T07:28:00.000Z',
            });
            expect(result.success).toBe(false);
        },
    );
});

describe('prepareLumpTranscriptFile', () => {
    let projectRoot: string;

    afterEach(async () => {
        if (projectRoot) await removeTempTestDirs({ projectRoot });
    });

    it('creates the transcript on the first write, gitignores it once, and does not touch a daemon log', async () => {
        ({ projectRoot } = await createTempTestDirs({
            prefix: 'lump-transcript-',
            remote: false,
            global: false,
            mkdirLocalConfig: false,
        }));
        const daemonLog = path.join(projectRoot, 'daemon.log');
        await fs.writeFile(daemonLog, 'operational\n');

        const prepared = await prepareLumpTranscriptFile({
            projectRoot,
            lumpName: 'myLump',
            discoveryBranch: 'feature/foo',
            tickStartedAt: '2026-10-16T07:28:00.000Z',
        });
        expect(prepared.success).toBe(true);
        if (!prepared.success) return;
        await expect(fs.access(prepared.data.filePath)).rejects.toThrow();
        prepared.data.write('');
        await expect(fs.access(prepared.data.filePath)).rejects.toThrow();
        prepared.data.write('--- myLump ctx 0 echo\n');
        expect(await fs.readFile(prepared.data.filePath, 'utf-8')).toBe('--- myLump ctx 0 echo\n');

        const gitignore = await fs.readFile(path.join(projectRoot, '.gitignore'), 'utf-8');
        expect(gitignore).toContain(TRANSCRIPTS_GITIGNORE_LINE);
        const again = await prepareLumpTranscriptFile({
            projectRoot,
            lumpName: 'myLump',
            discoveryBranch: 'feature/foo',
            tickStartedAt: '2026-10-16T07:28:00.000Z',
        });
        expect(again.success).toBe(true);
        const gitignoreAgain = await fs.readFile(path.join(projectRoot, '.gitignore'), 'utf-8');
        expect(gitignoreAgain.match(/\.lumpcode\/\*\*\/transcripts\//g)).toHaveLength(1);
        expect(await fs.readFile(daemonLog, 'utf-8')).toBe('operational\n');
    });
});

describe('listLumpTranscriptFiles', () => {
    let projectRoot: string;

    afterEach(async () => {
        if (projectRoot) await removeTempTestDirs({ projectRoot });
    });

    async function setupProject() {
        ({ projectRoot } = await createTempTestDirs({
            prefix: 'lump-transcript-list-',
            remote: false,
            global: false,
            mkdirLocalConfig: true,
        }));
        return projectRoot;
    }

    async function writeLog(
        lumpName: string,
        discoveryBranch: string,
        stamp: string,
        content = '--- header\n',
    ) {
        const filePath = path.join(
            projectRoot,
            '.lumpcode',
            'lumps',
            lumpName,
            'transcripts',
            ...discoveryBranch.split('/'),
            `${stamp}.log`,
        );
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
        return filePath;
    }

    it('reconstructs nested discoveryBranch from the path under transcripts/', async () => {
        await setupProject();
        const filePath = await writeLog('myLump', 'feature/foo', '2026-10-16T07-28-00.000Z');
        const result = await listLumpTranscriptFiles({ projectRoot, lumpName: 'myLump' });
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toEqual([{
            lumpName: 'myLump',
            discoveryBranch: 'feature/foo',
            stamp: '2026-10-16T07-28-00.000Z',
            filePath,
        }]);
    });

    it('filters --discoveryBranch by exact branch, not a prefix', async () => {
        await setupProject();
        await writeLog('myLump', 'feature', '2026-10-16T08-00-00.000Z');
        await writeLog('myLump', 'feature/foo', '2026-10-16T07-28-00.000Z');
        const result = await listLumpTranscriptFiles({
            projectRoot,
            lumpName: 'myLump',
            discoveryBranch: 'feature',
        });
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.map((row) => row.discoveryBranch)).toEqual(['feature']);
    });

    it('sorts stamp descending, then lumpName, then discoveryBranch', async () => {
        await setupProject();
        await writeLog('beta', 'dev', '2026-10-16T09-00-00.000Z');
        await writeLog('alpha', 'zebra', '2026-10-16T09-00-00.000Z');
        await writeLog('alpha', 'dev', '2026-10-16T09-00-00.000Z');
        await writeLog('alpha', 'dev', '2026-10-16T08-00-00.000Z');
        const result = await listLumpTranscriptFiles({ projectRoot });
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.map((row) => `${row.stamp} ${row.lumpName} ${row.discoveryBranch}`)).toEqual([
            '2026-10-16T09-00-00.000Z alpha dev',
            '2026-10-16T09-00-00.000Z alpha zebra',
            '2026-10-16T09-00-00.000Z beta dev',
            '2026-10-16T08-00-00.000Z alpha dev',
        ]);
    });

    it('ignores non-.log files and returns [] when the tree is missing', async () => {
        await setupProject();
        const skipPath = path.join(
            projectRoot,
            '.lumpcode',
            'lumps',
            'myLump',
            'transcripts',
            'dev',
            'notes.txt',
        );
        await fs.mkdir(path.dirname(skipPath), { recursive: true });
        await fs.writeFile(skipPath, 'ignore\n', 'utf-8');
        const withNoise = await listLumpTranscriptFiles({ projectRoot, lumpName: 'myLump' });
        expect(withNoise.success).toBe(true);
        if (!withNoise.success) return;
        expect(withNoise.data).toEqual([]);

        const empty = await listLumpTranscriptFiles({
            projectRoot: path.join(projectRoot, 'missing'),
        });
        expect(empty.success).toBe(true);
        if (!empty.success) return;
        expect(empty.data).toEqual([]);
    });
});

describe('resolveLumpTranscriptFile', () => {
    let projectRoot: string;

    afterEach(async () => {
        if (projectRoot) await removeTempTestDirs({ projectRoot });
    });

    async function setupProject() {
        ({ projectRoot } = await createTempTestDirs({
            prefix: 'lump-transcript-resolve-',
            remote: false,
            global: false,
            mkdirLocalConfig: true,
        }));
        return projectRoot;
    }

    async function writeLog(lumpName: string, discoveryBranch: string, stamp: string) {
        const filePath = path.join(
            projectRoot,
            '.lumpcode',
            'lumps',
            lumpName,
            'transcripts',
            ...discoveryBranch.split('/'),
            `${stamp}.log`,
        );
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, '--- header\n', 'utf-8');
        return filePath;
    }

    it('selects the newest stamp for a lump', async () => {
        await setupProject();
        await writeLog('myLump', 'dev', '2026-10-16T07-28-00.000Z');
        const newest = await writeLog('myLump', 'dev', '2026-10-16T09-00-00.000Z');
        const result = await resolveLumpTranscriptFile({ projectRoot, lumpName: 'myLump' });
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.stamp).toBe('2026-10-16T09-00-00.000Z');
        expect(result.data.filePath).toBe(newest);
    });

    it('fails when the newest stamp exists on two branches without --discoveryBranch', async () => {
        await setupProject();
        await writeLog('myLump', 'dev', '2026-10-16T09-00-00.000Z');
        await writeLog('myLump', 'feature/foo', '2026-10-16T09-00-00.000Z');
        const result = await resolveLumpTranscriptFile({ projectRoot, lumpName: 'myLump' });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.data).toContain('--discoveryBranch');
        expect(result.data).toContain('2026-10-16T09-00-00.000Z');
    });

    it('does not fall back when --stamp is missing', async () => {
        await setupProject();
        await writeLog('myLump', 'dev', '2026-10-16T07-28-00.000Z');
        const result = await resolveLumpTranscriptFile({
            projectRoot,
            lumpName: 'myLump',
            stamp: '2026-10-16T09-00-00.000Z',
        });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.data).toContain('--stamp 2026-10-16T09-00-00.000Z');
        expect(result.data).toContain('--list');
    });

    it('does not treat an ISO spelling with colons as the stamp token', async () => {
        await setupProject();
        await writeLog('myLump', 'dev', '2026-10-16T07-28-00.000Z');
        const result = await resolveLumpTranscriptFile({
            projectRoot,
            lumpName: 'myLump',
            stamp: '2026-10-16T07:28:00.000Z',
        });
        expect(result.success).toBe(false);
    });
});
