import * as fs from 'node:fs/promises';

import { pollUntil, pollUntilPathExists } from '../utils/pollUntil';

export async function waitForDaemonPidFile(pidFilePath: string, timeoutMs = 5000): Promise<void> {
    await pollUntilPathExists({ filePath: pidFilePath, timeoutMs, intervalMs: 25, timeoutLabel: 'PID file' });
}

export async function waitForDaemonMetaFile(metaFilePath: string, timeoutMs = 5000): Promise<void> {
    await pollUntilPathExists({ filePath: metaFilePath, timeoutMs, intervalMs: 25, timeoutLabel: 'meta file' });
}

/**
 * Wait until the alive-daemon test child has overwritten stub meta.
 * Parent stub omits `inFlightLumpCount`; `daemonForegroundChild.cjs` writes `0` when idle.
 */
export async function waitForAliveDaemonChildMeta(
    metaFilePath: string,
    timeoutMs = 5000,
): Promise<void> {
    await pollUntil({
        timeoutMs,
        intervalMs: 25,
        timeoutError: `Timed out waiting for alive-daemon child meta at ${metaFilePath}`,
        poll: async () => {
            try {
                const parsed = JSON.parse(await fs.readFile(metaFilePath, 'utf8')) as {
                    inFlightLumpCount?: number;
                };
                return parsed.inFlightLumpCount === 0 ? true : undefined;
            } catch {
                return undefined;
            }
        },
    });
}
