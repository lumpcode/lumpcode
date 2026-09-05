import * as fs from 'node:fs/promises';

import { pollUntil } from '../utils/pollUntil';
import { writeJsonFile } from '../utils/writeJsonFile';
import { waitForAliveDaemonChildMeta } from './waitForDaemonPidFile';

function metaMatches(fileContents: string, data: Record<string, unknown>): boolean {
    const parsed = JSON.parse(fileContents) as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) {
        if (JSON.stringify(parsed[key]) !== JSON.stringify(value)) {
            return false;
        }
    }
    return true;
}

/**
 * Writes daemon meta and retries until a read-back matches.
 * Detached `start` writes stub meta, then the foreground child overwrites it once;
 * a single write after `waitForDaemonPidFile` can be clobbered.
 */
export async function writeDaemonMetaSticky(input: {
    filePath: string;
    data: Record<string, unknown>;
    timeoutMs?: number;
}): Promise<void> {
    const { filePath, data, timeoutMs = 5000 } = input;
    await waitForAliveDaemonChildMeta(filePath, timeoutMs);
    await pollUntil({
        timeoutMs,
        intervalMs: 25,
        timeoutError: `Timed out waiting for sticky daemon meta at ${filePath}`,
        poll: async () => {
            const writeResult = await writeJsonFile({
                filePath,
                data,
                trailingNewline: true,
            });
            if (!writeResult.success) {
                return undefined;
            }
            try {
                return metaMatches(await fs.readFile(filePath, 'utf8'), data) ? true : undefined;
            } catch {
                return undefined;
            }
        },
    });
}

/**
 * Unlinks daemon meta and retries until it stays gone.
 * Waits for the foreground child overwrite first so the file is not recreated after unlink.
 */
export async function removeDaemonMetaUntilGone(
    filePath: string,
    timeoutMs = 5000,
): Promise<void> {
    await waitForAliveDaemonChildMeta(filePath, timeoutMs);
    await pollUntil({
        timeoutMs,
        intervalMs: 25,
        timeoutError: `Timed out waiting for daemon meta to stay gone at ${filePath}`,
        poll: async () => {
            try {
                await fs.unlink(filePath);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    return undefined;
                }
            }
            try {
                await fs.access(filePath);
                return undefined;
            } catch {
                return true;
            }
        },
    });
}
