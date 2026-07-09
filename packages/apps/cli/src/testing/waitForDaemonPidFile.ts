import { pollUntilPathExists } from '../utils/pollUntil';

export async function waitForDaemonPidFile(pidFilePath: string, timeoutMs = 5000): Promise<void> {
    await pollUntilPathExists({ filePath: pidFilePath, timeoutMs, intervalMs: 25, timeoutLabel: 'PID file' });
}

export async function waitForDaemonMetaFile(metaFilePath: string, timeoutMs = 5000): Promise<void> {
    await pollUntilPathExists({ filePath: metaFilePath, timeoutMs, intervalMs: 25, timeoutLabel: 'meta file' });
}
