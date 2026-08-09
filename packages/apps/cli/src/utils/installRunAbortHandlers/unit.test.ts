import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installRunAbortHandlers } from './main';
import {
    resolveNodeExecutableForWatchdog,
    RUN_ABORT_WATCHDOG_SOURCE,
} from './watchdogSource';

function latestSigintListener(before: Set<NodeJS.SignalsListener>): NodeJS.SignalsListener {
    const after = process.listeners('SIGINT');
    const added = after.find((listener) => !before.has(listener));
    if (!added) {
        throw new Error('expected installRunAbortHandlers to register a SIGINT listener');
    }
    return added;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('installRunAbortHandlers', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('first SIGINT aborts; second SIGINT force-exits with 130', () => {
        const abortController = new AbortController();
        const exit = vi.fn();
        const warn = vi.fn();
        const before = new Set(process.listeners('SIGINT'));

        const dispose = installRunAbortHandlers({
            abortController,
            forceExitGraceMs: 0,
            watchdog: false,
            exit,
            logger: { warn },
        });

        try {
            const onSigint = latestSigintListener(before);
            onSigint('SIGINT');
            expect(abortController.signal.aborted).toBe(true);
            expect(exit).not.toHaveBeenCalled();

            onSigint('SIGINT');
            expect(exit).toHaveBeenCalledWith(130);
        } finally {
            dispose();
        }
    });

    it('force-exits after grace timeout when the run does not unwind', () => {
        vi.useFakeTimers();
        const abortController = new AbortController();
        const exit = vi.fn();
        const before = new Set(process.listeners('SIGINT'));

        const dispose = installRunAbortHandlers({
            abortController,
            forceExitGraceMs: 1000,
            watchdog: false,
            exit,
            logger: { warn: vi.fn() },
        });

        try {
            const onSigint = latestSigintListener(before);
            onSigint('SIGINT');
            expect(abortController.signal.aborted).toBe(true);
            expect(exit).not.toHaveBeenCalled();

            vi.advanceTimersByTime(999);
            expect(exit).not.toHaveBeenCalled();

            vi.advanceTimersByTime(1);
            expect(exit).toHaveBeenCalledWith(130);
        } finally {
            dispose();
        }
    });

    it('dispose clears handlers and cancels the grace timer', () => {
        vi.useFakeTimers();
        const abortController = new AbortController();
        const exit = vi.fn();
        const before = new Set(process.listeners('SIGINT'));

        const dispose = installRunAbortHandlers({
            abortController,
            forceExitGraceMs: 1000,
            watchdog: false,
            exit,
            logger: { warn: vi.fn() },
        });

        const onSigint = latestSigintListener(before);
        onSigint('SIGINT');
        dispose();

        vi.advanceTimersByTime(5000);
        expect(exit).not.toHaveBeenCalled();
        expect(process.listeners('SIGINT')).not.toContain(onSigint);
    });
});

describe('run-abort watchdog', () => {
    it('SIGKILLs a sync-wedged parent after grace when the watchdog gets SIGINT', async () => {
        const graceMs = 400;
        const nodeExecutable = resolveNodeExecutableForWatchdog();

        const victim = spawn(
            nodeExecutable,
            ['-e', 'process.on("SIGINT",()=>{}); process.send({pid:process.pid}); while(true){}'],
            {
                stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
                windowsHide: true,
            },
        );

        const victimPid = await new Promise<number>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('victim did not become ready')), 5000);
            victim.on('message', (msg) => {
                clearTimeout(timer);
                resolve((msg as { pid: number }).pid);
            });
            victim.on('error', reject);
        });

        const watchdog = spawn(
            nodeExecutable,
            ['-e', RUN_ABORT_WATCHDOG_SOURCE, String(victimPid), String(graceMs)],
            {
                stdio: ['pipe', 'ignore', 'ignore'],
                windowsHide: true,
            },
        );

        // Let the watchdog register signal handlers before delivering SIGINT.
        await sleep(100);
        process.kill(watchdog.pid!, 'SIGINT');

        const signal = await new Promise<NodeJS.Signals | null>((resolve, reject) => {
            const timer = setTimeout(() => {
                try {
                    process.kill(victimPid, 'SIGKILL');
                } catch {
                    // already gone
                }
                try {
                    watchdog.kill('SIGKILL');
                } catch {
                    // already gone
                }
                reject(new Error('wedged parent was not killed by watchdog in time'));
            }, graceMs + 3000);
            victim.on('exit', (_code, gotSignal) => {
                clearTimeout(timer);
                resolve(gotSignal);
            });
        });

        expect(signal).toBe('SIGKILL');
        await sleep(50);
        try {
            watchdog.kill('SIGKILL');
        } catch {
            // already exited after killing parent
        }
    }, 15_000);

    it('disarms when stdin closes before grace elapses', async () => {
        const graceMs = 2000;
        const nodeExecutable = resolveNodeExecutableForWatchdog();
        const target = spawn(nodeExecutable, ['-e', 'setInterval(() => {}, 60000)'], {
            stdio: 'ignore',
            windowsHide: true,
        });
        const targetPid = target.pid;
        expect(targetPid).toBeTypeOf('number');

        const watchdog = spawn(
            nodeExecutable,
            ['-e', RUN_ABORT_WATCHDOG_SOURCE, String(targetPid), String(graceMs)],
            {
                stdio: ['pipe', 'ignore', 'ignore'],
                windowsHide: true,
            },
        );

        await sleep(100);
        process.kill(watchdog.pid!, 'SIGINT');
        await sleep(50);
        watchdog.stdin!.end();

        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('watchdog did not exit after stdin end')), 2000);
            watchdog.on('exit', () => {
                clearTimeout(timer);
                resolve();
            });
        });

        expect(() => process.kill(targetPid!, 0)).not.toThrow();
        target.kill('SIGKILL');
        await new Promise<void>((resolve) => target.on('exit', () => resolve()));
    }, 10_000);
});
