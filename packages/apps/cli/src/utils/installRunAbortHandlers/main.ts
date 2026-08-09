import { spawn, type ChildProcess } from 'node:child_process';

import {
    resolveNodeExecutableForWatchdog,
    RUN_ABORT_WATCHDOG_SOURCE,
} from './watchdogSource';

export const RUN_ABORT_FORCE_EXIT_GRACE_MS = 5_000;

export type InstallRunAbortHandlersInput = {
    abortController: AbortController;
    /** After first abort, force-exit if the run has not unwound. Default 5000. `0` disables. */
    forceExitGraceMs?: number;
    /** Injectable for tests. Defaults to `process.exit`. */
    exit?: (code: number) => void;
    logger?: {
        warn: (message: string) => void;
    };
    /**
     * Spawn a sibling watchdog that can SIGKILL this process after grace if a sync
     * busy-loop blocks JS SIGINT handlers. Default: enabled when `forceExitGraceMs > 0`.
     */
    watchdog?: boolean;
};

function spawnRunAbortWatchdog(input: {
    parentPid: number;
    graceMs: number;
}): ChildProcess | undefined {
    const nodeExecutable = resolveNodeExecutableForWatchdog();
    try {
        const child = spawn(
            nodeExecutable,
            ['-e', RUN_ABORT_WATCHDOG_SOURCE, String(input.parentPid), String(input.graceMs)],
            {
                stdio: ['pipe', 'ignore', 'ignore'],
                windowsHide: true,
            },
        );
        child.on('error', () => {
            // Missing node on PATH (e.g. SEA without node) — soft abort still works.
        });
        return child;
    } catch {
        return undefined;
    }
}

function stopWatchdog(watchdog: ChildProcess | undefined): void {
    if (!watchdog || watchdog.killed) {
        return;
    }
    try {
        watchdog.stdin?.end();
    } catch {
        // ignore
    }
    try {
        watchdog.kill('SIGTERM');
    } catch {
        // ignore
    }
}

/**
 * First SIGINT/SIGTERM aborts the in-flight run. A second signal, or the grace
 * timeout after the first, force-exits so a stuck hook cannot hold workspace
 * locks forever (stale PID recovery / exit sync unlock can clear them).
 *
 * A watchdog child in the same process group also arms on Ctrl+C so a parent
 * stuck in a sync busy-loop (JS handlers never run) is still SIGKILL'd.
 */
export function installRunAbortHandlers(input: InstallRunAbortHandlersInput): () => void {
    const {
        abortController,
        forceExitGraceMs = RUN_ABORT_FORCE_EXIT_GRACE_MS,
        exit = (code) => {
            process.exit(code);
        },
        logger,
        watchdog: watchdogOpt,
    } = input;

    const watchdogEnabled = watchdogOpt ?? forceExitGraceMs > 0;
    const watchdog = watchdogEnabled
        ? spawnRunAbortWatchdog({
            parentPid: process.pid,
            graceMs: forceExitGraceMs > 0 ? forceExitGraceMs : RUN_ABORT_FORCE_EXIT_GRACE_MS,
        })
        : undefined;

    let forceExitTimer: ReturnType<typeof setTimeout> | undefined;

    const forceExit = (code: number) => {
        if (forceExitTimer !== undefined) {
            clearTimeout(forceExitTimer);
            forceExitTimer = undefined;
        }
        stopWatchdog(watchdog);
        logger?.warn('Forcing exit after interrupt; releasing workspace locks if held.');
        exit(code);
    };

    const onSignal = (signal: NodeJS.Signals) => {
        const exitCode = signal === 'SIGINT' ? 130 : 143;
        if (abortController.signal.aborted) {
            forceExit(exitCode);
            return;
        }
        abortController.abort();
        logger?.warn(
            forceExitGraceMs > 0
                ? 'Aborting lump run… press Ctrl+C again to force exit.'
                : 'Aborting lump run…',
        );
        if (forceExitGraceMs > 0) {
            forceExitTimer = setTimeout(() => {
                forceExit(exitCode);
            }, forceExitGraceMs);
            forceExitTimer.unref?.();
        }
    };

    const onSigint = () => onSignal('SIGINT');
    const onSigterm = () => onSignal('SIGTERM');
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);

    return () => {
        process.off('SIGINT', onSigint);
        process.off('SIGTERM', onSigterm);
        if (forceExitTimer !== undefined) {
            clearTimeout(forceExitTimer);
            forceExitTimer = undefined;
        }
        stopWatchdog(watchdog);
    };
}
