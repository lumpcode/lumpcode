import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { pollUntil, pollUntilPathExists } from './main';

describe('pollUntil', () => {
    it('returns immediately when poll succeeds on the first call', async () => {
        const result = await pollUntil({
            timeoutMs: 1000,
            poll: () => 'ready',
        });
        expect(result).toBe('ready');
    });

    it('returns when poll succeeds after earlier misses', async () => {
        let attempts = 0;
        const result = await pollUntil({
            timeoutMs: 1000,
            intervalMs: 10,
            poll: () => {
                attempts += 1;
                return attempts >= 3 ? { ok: true } : undefined;
            },
        });
        expect(result).toEqual({ ok: true });
        expect(attempts).toBeGreaterThanOrEqual(3);
    });

    it('returns undefined when the timeout elapses', async () => {
        const result = await pollUntil({
            timeoutMs: 50,
            intervalMs: 10,
            poll: () => undefined,
        });
        expect(result).toBeUndefined();
    });

    it('treats null and false as keep-polling sentinels', async () => {
        let attempts = 0;
        const result = await pollUntil({
            timeoutMs: 1000,
            intervalMs: 10,
            poll: () => {
                attempts += 1;
                if (attempts === 1) return null;
                if (attempts === 2) return false;
                return 1;
            },
        });
        expect(result).toBe(1);
        expect(attempts).toBe(3);
    });

    it('awaits async poll results', async () => {
        let attempts = 0;
        const result = await pollUntil({
            timeoutMs: 1000,
            intervalMs: 10,
            poll: async () => {
                attempts += 1;
                await new Promise((resolve) => setTimeout(resolve, 1));
                return attempts >= 2 ? 'done' : undefined;
            },
        });
        expect(result).toBe('done');
    });
});

describe('pollUntil timeoutError', () => {
    it('throws the configured error when the timeout elapses', async () => {
        await expect(
            pollUntil({
                timeoutMs: 50,
                intervalMs: 10,
                timeoutError: 'not ready',
                poll: () => undefined,
            }),
        ).rejects.toThrow('not ready');
    });
});

describe('pollUntilPathExists', () => {
    it('resolves when the file appears', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poll-until-path-'));
        const filePath = path.join(dir, 'ready.txt');
        setTimeout(() => {
            void fs.writeFile(filePath, 'ok', 'utf8');
        }, 20);
        await expect(
            pollUntilPathExists({ filePath, timeoutMs: 1000, intervalMs: 10 }),
        ).resolves.toBeUndefined();
    });
});
