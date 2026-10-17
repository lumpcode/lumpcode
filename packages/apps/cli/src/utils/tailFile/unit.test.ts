import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { DEFAULT_TAIL_LINES, tailFile } from './main';

describe('tailFile', () => {
    let projectRoot: string;

    afterEach(async () => {
        if (projectRoot) await removeTempTestDirs({ projectRoot });
        vi.restoreAllMocks();
    });

    async function writeLog(content: string) {
        ({ projectRoot } = await createTempTestDirs({
            prefix: 'lump-tail-file-',
            remote: false,
            global: false,
            mkdirLocalConfig: false,
        }));
        const filePath = path.join(projectRoot, 'session.log');
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

    it('prints the last 10 lines when lines is the omitted-equivalent default', async () => {
        const filePath = await writeLog(twelveLines());
        const spawnFn = vi.fn() as unknown as typeof nodeSpawn;
        const result = await tailFile({
            filePath,
            lines: DEFAULT_TAIL_LINES,
            follow: false,
            spawnFn,
        });
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toEqual({
            lines: Array.from({ length: 10 }, (_, i) => `line ${i + 3}`),
        });
        expect(spawnFn).not.toHaveBeenCalled();
    });

    it('prints the last N lines when lines is N', async () => {
        const filePath = await writeLog(twelveLines());
        const result = await tailFile({ filePath, lines: 3, follow: false });
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toEqual({ lines: ['line 10', 'line 11', 'line 12'] });
    });

    it('prints the whole file when lines is 0 and follow is false', async () => {
        const filePath = await writeLog(twelveLines());
        const spawnFn = vi.fn() as unknown as typeof nodeSpawn;
        const result = await tailFile({ filePath, lines: 0, follow: false, spawnFn });
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toEqual({
            lines: Array.from({ length: 12 }, (_, i) => `line ${i + 1}`),
        });
        expect(spawnFn).not.toHaveBeenCalled();
    });

    it('follows from the start with tail -n +1 -f when lines is 0', async () => {
        const filePath = await writeLog('live\n');
        const spawnFn = makeFollowSpawnMock(['-n', '+1', '-f', filePath]);
        const result = await tailFile({ filePath, lines: 0, follow: true, spawnFn });
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toEqual({ followed: true });
        expect(spawnFn).toHaveBeenCalledOnce();
    });

    it('follows last N with tail -n N -f and never uses -n 0', async () => {
        const filePath = await writeLog('live\n');
        const spawnFn = makeFollowSpawnMock(['-n', '10', '-f', filePath]);
        const beforeTerm = process.listenerCount('SIGTERM');
        const result = await tailFile({
            filePath,
            lines: DEFAULT_TAIL_LINES,
            follow: true,
            spawnFn,
        });
        expect(result.success).toBe(true);
        expect(spawnFn).toHaveBeenCalledOnce();
        expect(process.listenerCount('SIGTERM')).toBe(beforeTerm);
    });
});
