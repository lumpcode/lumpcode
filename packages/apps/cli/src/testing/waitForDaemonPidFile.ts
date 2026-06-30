import * as fs from 'node:fs/promises';

async function waitForPath(filePath: string, label: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            await fs.access(filePath);
            return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }
    throw new Error(`Timed out waiting for daemon ${label} at ${filePath}`);
}

export async function waitForDaemonPidFile(pidFilePath: string, timeoutMs = 5000): Promise<void> {
    await waitForPath(pidFilePath, 'PID file', timeoutMs);
}

export async function waitForDaemonMetaFile(metaFilePath: string, timeoutMs = 5000): Promise<void> {
    await waitForPath(metaFilePath, 'meta file', timeoutMs);
}
