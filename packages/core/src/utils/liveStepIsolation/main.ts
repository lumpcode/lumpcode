import { execFileSync } from 'node:child_process';

/**
 * Boxes (process groups and systemd scopes) of step commands running in this
 * process. Whoever kills this process without letting it clean up, such as a
 * force-exit or `stop --force`, needs them: this process kills them on exit,
 * and the daemon publishes them in its meta.
 */
export type LiveStepIsolation = {
    processGroups: number[];
    systemdScopes: string[];
};

export type TrackedStepIsolation =
    | { kind: 'processGroup'; pgid: number }
    | { kind: 'systemdScope'; unitName: string };

const SYSTEMCTL_EXIT_TIMEOUT_MS = 5000;

const processGroups = new Set<number>();
const systemdScopes = new Set<string>();
const listeners = new Set<(live: LiveStepIsolation) => void>();
let exitHookInstalled = false;

function notify(): void {
    const live = listLiveStepIsolation();
    for (const listener of listeners) listener(live);
}

export function listLiveStepIsolation(): LiveStepIsolation {
    return { processGroups: [...processGroups], systemdScopes: [...systemdScopes] };
}

/** SIGKILLs every tracked box. Synchronous so it can run in `process.on('exit')`. */
export function killLiveStepIsolationSync(): void {
    for (const pgid of processGroups) {
        try {
            process.kill(-pgid, 'SIGKILL');
        } catch {
            // Already gone; best effort while exiting.
        }
    }
    if (systemdScopes.size === 0) return;
    try {
        execFileSync(
            'systemctl',
            ['--user', 'kill', '--signal=SIGKILL', ...systemdScopes],
            { stdio: 'ignore', timeout: SYSTEMCTL_EXIT_TIMEOUT_MS },
        );
    } catch {
        // Units already gone; best effort while exiting.
    }
}

/** Tracks a step's box until the returned function is called. */
export function trackStepIsolation(isolation: TrackedStepIsolation): () => void {
    if (!exitHookInstalled) {
        exitHookInstalled = true;
        process.on('exit', killLiveStepIsolationSync);
    }
    const remove = isolation.kind === 'processGroup'
        ? () => processGroups.delete(isolation.pgid)
        : () => systemdScopes.delete(isolation.unitName);
    if (isolation.kind === 'processGroup') processGroups.add(isolation.pgid);
    else systemdScopes.add(isolation.unitName);
    notify();
    return () => {
        if (remove()) notify();
    };
}

/** Calls `listener` with every tracked box whenever one is tracked or released. */
export function onLiveStepIsolationChange(listener: (live: LiveStepIsolation) => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
