import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import {
    lumpTranscriptFilePath,
    prepareLumpTranscriptFile,
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
