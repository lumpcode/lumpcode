import * as fs from 'node:fs/promises';

export async function waitForDaemonPidFile(pidFilePath: string, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            await fs.access(pidFilePath);
            return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }
    throw new Error(`Timed out waiting for daemon PID file at ${pidFilePath}`);
}
