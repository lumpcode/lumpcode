let daemonTestGlobalConfigFolderPath: string | undefined;

export function setDaemonTestGlobalConfigFolder(path: string): void {
    daemonTestGlobalConfigFolderPath = path;
}

export function getDaemonTestGlobalConfigFolder(): string {
    if (daemonTestGlobalConfigFolderPath === undefined) {
        throw new Error(
            'Call setDaemonTestGlobalConfigFolder() in the test before using aliveDaemonSpawnFn.',
        );
    }
    return daemonTestGlobalConfigFolderPath;
}
