import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTempTestDirs, initLocalGitRepo, removeTempTestDirs } from '../../utils';
import { command as transcriptCommand } from './main';

describe('transcript command', () => {
    let projectRoot: string;
    let localConfigFolderPath: string;

    afterEach(async () => {
        if (projectRoot) await removeTempTestDirs({ projectRoot });
        vi.restoreAllMocks();
    });

    async function setupProject() {
        ({ projectRoot, localConfigFolderPath } = await createTempTestDirs({
            prefix: 'lump-transcript-cmd-',
            remote: false,
            global: false,
        }));
        initLocalGitRepo({ cwd: projectRoot });
    }

    function makeHandler(spawnFn?: typeof nodeSpawn) {
        return transcriptCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            ...(spawnFn !== undefined ? { spawnFn } : {}),
        });
    }

    async function writeTranscript(input: {
        lumpName: string;
        discoveryBranch: string;
        stamp: string;
        content?: string;
    }) {
        const filePath = path.join(
            projectRoot,
            '.lumpcode',
            'lumps',
            input.lumpName,
            'transcripts',
            ...input.discoveryBranch.split('/'),
            `${input.stamp}.log`,
        );
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, input.content ?? '--- header\nline two\n', 'utf-8');
        return filePath;
    }

    function twelveLines() {
        return Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    }

    function makeFollowSpawnMock(expectedArgs: string[]) {
        return vi.fn((command: string, args: readonly string[]) => {
            expect(command).toBe('tail');
            expect(args).toEqual(expectedArgs);
            const child = new EventEmitter() as ReturnType<typeof nodeSpawn>;
            Object.assign(child, { stdout: null, stderr: null, kill: vi.fn() });
            queueMicrotask(() => child.emit('close', 0, null));
            return child;
        }) as unknown as typeof nodeSpawn;
    }

    it('fails when not a Lumpcode project root', async () => {
        const dirs = await createTempTestDirs({
            prefix: 'lump-transcript-cmd-bad-',
            remote: false,
            global: false,
        });
        try {
            const handle = transcriptCommand.handlerMaker({
                projectRoot: dirs.projectRoot,
                localConfigFolderPath: dirs.localConfigFolderPath,
            });
            const result = await handle({
                options: { lumpName: 'myLump', noFollow: true },
                arguments: {},
            });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain('Not a Lumpcode project root');
        } finally {
            await removeTempTestDirs(dirs);
        }
    });

    it('requires --lumpName unless --list', async () => {
        await setupProject();
        const result = await makeHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('--lumpName');
        expect(result.data.messages[0]).toContain('--list');
    });

    it.each([
        { stamp: '2026-10-16T07-28-00.000Z' },
        { lines: 10 },
        { noFollow: true },
    ])('rejects --list combined with %j', async (extra) => {
        await setupProject();
        const result = await makeHandler()({
            options: { list: true, ...extra },
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('--list cannot be combined');
    });

    it('fails --json print without --noFollow', async () => {
        await setupProject();
        await writeTranscript({
            lumpName: 'myLump',
            discoveryBranch: 'dev',
            stamp: '2026-10-16T07-28-00.000Z',
        });
        const result = await makeHandler()({
            options: { lumpName: 'myLump', json: true },
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('--json');
        expect(result.data.messages[0]).toContain('--noFollow');
    });

    it('succeeds with --json --list', async () => {
        await setupProject();
        const filePath = await writeTranscript({
            lumpName: 'myLump',
            discoveryBranch: 'feature/foo',
            stamp: '2026-10-16T07-28-00.000Z',
        });
        const result = await makeHandler()({
            options: { list: true, json: true },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages).toEqual([
            '2026-10-16T07-28-00.000Z  myLump  feature/foo',
        ]);
        expect(result.data.data).toEqual({
            transcripts: [{
                lumpName: 'myLump',
                discoveryBranch: 'feature/foo',
                stamp: '2026-10-16T07-28-00.000Z',
                filePath,
            }],
        });
    });

    it('succeeds with --list when the catalog is empty', async () => {
        await setupProject();
        const result = await makeHandler()({ options: { list: true }, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages).toEqual([]);
        expect(result.data.data).toEqual({ transcripts: [] });
    });

    it('fails print when no file matches and mentions --list', async () => {
        await setupProject();
        const result = await makeHandler()({
            options: { lumpName: 'myLump', noFollow: true },
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('myLump');
        expect(result.data.messages[0]).toContain('--list');
    });

    it('prints last 10 lines with --noFollow and does not read a daemon log', async () => {
        await setupProject();
        await writeTranscript({
            lumpName: 'myLump',
            discoveryBranch: 'dev',
            stamp: '2026-10-16T07-28-00.000Z',
            content: twelveLines(),
        });
        await fs.writeFile(path.join(projectRoot, 'daemon.log'), 'operational\n', 'utf-8');
        const result = await makeHandler()({
            options: { lumpName: 'myLump', noFollow: true },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages).toEqual(
            Array.from({ length: 10 }, (_, i) => `line ${i + 3}`),
        );
        expect(result.data.messages.join('\n')).not.toContain('operational');
        expect(result.data.data!.lines).toEqual(result.data.messages);
        expect(result.data.data!.stamp).toBe('2026-10-16T07-28-00.000Z');
    });

    it('prints the whole file with --noFollow --lines 0', async () => {
        await setupProject();
        await writeTranscript({
            lumpName: 'myLump',
            discoveryBranch: 'dev',
            stamp: '2026-10-16T07-28-00.000Z',
            content: twelveLines(),
        });
        const result = await makeHandler()({
            options: { lumpName: 'myLump', noFollow: true, lines: 0 },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages).toEqual(
            Array.from({ length: 12 }, (_, i) => `line ${i + 1}`),
        );
    });

    it('follows the transcript file, not a daemon log', async () => {
        await setupProject();
        const filePath = await writeTranscript({
            lumpName: 'myLump',
            discoveryBranch: 'dev',
            stamp: '2026-10-16T07-28-00.000Z',
        });
        const daemonLog = path.join(projectRoot, 'daemon.log');
        await fs.writeFile(daemonLog, 'operational\n', 'utf-8');
        const spawnFn = makeFollowSpawnMock(['-n', '10', '-f', filePath]);
        const result = await makeHandler(spawnFn)({
            options: { lumpName: 'myLump' },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(spawnFn).toHaveBeenCalledOnce();
        expect(result.data.messages).toEqual(['Stopped following transcript.']);
    });

    it('asks for --discoveryBranch when the newest stamp is on two branches', async () => {
        await setupProject();
        await writeTranscript({
            lumpName: 'myLump',
            discoveryBranch: 'dev',
            stamp: '2026-10-16T09-00-00.000Z',
        });
        await writeTranscript({
            lumpName: 'myLump',
            discoveryBranch: 'feature/foo',
            stamp: '2026-10-16T09-00-00.000Z',
        });
        const result = await makeHandler()({
            options: { lumpName: 'myLump', noFollow: true },
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('--discoveryBranch');
    });
});
