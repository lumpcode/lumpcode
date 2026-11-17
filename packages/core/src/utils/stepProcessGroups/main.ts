/**
 * Process groups of step commands that are running in this process. A step in
 * its own group is out of reach of both the terminal's Ctrl+C and the daemon's
 * group kill, so this process kills them on exit and the daemon publishes them
 * for the supervisor.
 */
const groups = new Set<number>();
const listeners = new Set<(pgids: number[]) => void>();
let exitHookInstalled = false;

function notify(): void {
    const pgids = listStepProcessGroups();
    for (const listener of listeners) listener(pgids);
}

export function listStepProcessGroups(): number[] {
    return [...groups];
}

/** SIGKILLs every tracked group. Synchronous so it can run in `process.on('exit')`. */
export function killStepProcessGroupsSync(): void {
    for (const pgid of groups) {
        try {
            process.kill(-pgid, 'SIGKILL');
        } catch {
            // Already gone; best effort while exiting.
        }
    }
}

/** Tracks `pgid` until the returned function is called. */
export function trackStepProcessGroup(pgid: number): () => void {
    if (!exitHookInstalled) {
        exitHookInstalled = true;
        process.on('exit', killStepProcessGroupsSync);
    }
    groups.add(pgid);
    notify();
    return () => {
        if (groups.delete(pgid)) notify();
    };
}

/** Calls `listener` with the full list whenever a group is tracked or released. */
export function onStepProcessGroupsChange(listener: (pgids: number[]) => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
