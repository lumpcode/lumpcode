import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import * as tailFileModule from '../tailFile';
import { completeLogTail, followableTailOptionFields } from './main';

describe('followableTailOptionFields', () => {
    const schema = z.object(followableTailOptionFields);

    it('accepts an omitted count, zero lines, and noFollow', () => {
        expect(schema.parse({})).toEqual({});
        expect(schema.parse({ lines: 0, noFollow: true })).toEqual({ lines: 0, noFollow: true });
    });

    it('rejects a negative line count', () => {
        expect(schema.safeParse({ lines: -1 }).success).toBe(false);
    });
});

describe('completeLogTail', () => {
    let projectRoot: string;

    afterEach(async () => {
        if (projectRoot) await removeTempTestDirs({ projectRoot });
        vi.restoreAllMocks();
    });

    async function makeRoot() {
        ({ projectRoot } = await createTempTestDirs({
            prefix: 'lump-complete-log-tail-',
            remote: false,
            global: false,
            mkdirLocalConfig: false,
        }));
        return projectRoot;
    }

    async function writeLog(content: string) {
        const root = await makeRoot();
        const filePath = path.join(root, 'session.log');
        await fs.writeFile(filePath, content, 'utf-8');
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

    it('returns the missing-file message and does not call tailFile', async () => {
        const root = await makeRoot();
        const filePath = path.join(root, 'missing.log');
        const tailSpy = vi.spyOn(tailFileModule, 'tailFile');

        const result = await completeLogTail({
            filePath,
            noFollow: true,
            missingMessage: 'No log yet.',
            followedMessage: 'Stopped following.',
            data: (outputLines) => ({ lines: outputLines }),
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.data).toEqual({ messages: ['No log yet.'] });
        expect(tailSpy).not.toHaveBeenCalled();
    });

    it('maps a tailFile failure into messages', async () => {
        const root = await makeRoot();
        const filePath = path.join(root, 'missing.log');

        const result = await completeLogTail({
            filePath,
            noFollow: true,
            followedMessage: 'Stopped following.',
            data: (outputLines) => outputLines,
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.data).toEqual({ messages: [`File not found: ${filePath}`] });
    });

    it('returns only the followed message after a live tail', async () => {
        const filePath = await writeLog('live\n');
        const spawnFn = makeFollowSpawnMock(['-n', '10', '-f', filePath]);

        const result = await completeLogTail({
            filePath,
            noFollow: false,
            spawnFn,
            followedMessage: 'Stopped following daemon log.',
            data: (outputLines) => ({ lines: outputLines }),
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toEqual({ messages: ['Stopped following daemon log.'] });
        expect(spawnFn).toHaveBeenCalledOnce();
    });

    it('returns captured lines as messages and data when noFollow is set', async () => {
        const filePath = await writeLog(twelveLines());
        const spawnFn = vi.fn() as unknown as typeof nodeSpawn;

        const result = await completeLogTail({
            filePath,
            lines: 3,
            noFollow: true,
            spawnFn,
            missingMessage: 'missing',
            followedMessage: 'Stopped following.',
            data: (outputLines) => ({ logFilePath: filePath, lines: outputLines }),
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.messages).toEqual(['line 10', 'line 11', 'line 12']);
        expect(result.data.data).toEqual({
            logFilePath: filePath,
            lines: ['line 10', 'line 11', 'line 12'],
        });
        expect(spawnFn).not.toHaveBeenCalled();
    });

    it('uses the last 10 lines when lines is omitted and the whole file when lines is 0', async () => {
        const filePath = await writeLog(twelveLines());

        const omitted = await completeLogTail({
            filePath,
            noFollow: true,
            followedMessage: 'Stopped following.',
            data: (outputLines) => outputLines,
        });
        expect(omitted.success).toBe(true);
        if (!omitted.success) return;
        expect(omitted.data.messages).toEqual(Array.from({ length: 10 }, (_, i) => `line ${i + 3}`));
        expect(omitted.data.data).toEqual(omitted.data.messages);

        const whole = await completeLogTail({
            filePath,
            lines: 0,
            noFollow: true,
            followedMessage: 'Stopped following.',
            data: (outputLines) => outputLines,
        });
        expect(whole.success).toBe(true);
        if (!whole.success) return;
        expect(whole.data.messages).toEqual(Array.from({ length: 12 }, (_, i) => `line ${i + 1}`));
        expect(whole.data.data).toEqual(whole.data.messages);
    });
});
