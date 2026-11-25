import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { readProcessStartId } from './main';

const supported = process.platform === 'linux' || process.platform === 'darwin';

describe('readProcessStartId', () => {
    it.runIf(supported)('returns the same id for the same live process', async () => {
        const first = await readProcessStartId(process.pid);
        expect(first).toMatch(/^\d+$/);
        await expect(readProcessStartId(process.pid)).resolves.toBe(first);
    });

    it.runIf(supported)('returns a different id for a process started later', async () => {
        const sleeper = () => spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)']);
        const first = sleeper();
        // macOS start ids have one-second resolution.
        await new Promise((resolve) => setTimeout(resolve, 1_100));
        const second = sleeper();
        try {
            const firstId = await readProcessStartId(first.pid!);
            const secondId = await readProcessStartId(second.pid!);
            expect(firstId).toMatch(/^\d+$/);
            expect(secondId).toMatch(/^\d+$/);
            expect(secondId).not.toBe(firstId);
        } finally {
            first.kill('SIGKILL');
            second.kill('SIGKILL');
        }
    });

    it('returns undefined for a pid that is not running', async () => {
        await expect(readProcessStartId(999_999_999)).resolves.toBeUndefined();
    });
});
