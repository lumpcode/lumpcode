import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

import { Failure, Logger, Success } from '../../types';
import {
    failure,
    killProcessGroup,
    killProcessTree,
    killSystemdScope,
    resolveSpawnExecutable,
    success,
    trackStepProcessGroup,
    wrapInSystemdScope,
} from '../../utils';

export type ExecBinaryFailureReason = 'timeout' | 'aborted' | 'exit' | 'spawn';

const STDERR_MESSAGE_PREVIEW_CHARS = 300;

function stderrMessagePreview(stderr: string): string {
    if (stderr.length <= STDERR_MESSAGE_PREVIEW_CHARS) return stderr;
    return `${stderr.slice(0, STDERR_MESSAGE_PREVIEW_CHARS)}…`;
}

/**
 * Where the child runs so that whatever it leaves behind can be killed once it
 * exits, times out, or is aborted.
 * - `systemdScope`: a transient `systemd-run --user --scope` unit (cgroup).
 *   Only after `detectSystemdScope()` reports it available.
 * - `processGroup`: a new process group, tracked by `trackStepProcessGroup`
 *   while it runs. Misses processes that leave the group (`setsid`,
 *   daemonizing). Ignored on Windows.
 */
export type ExecBinaryIsolation =
    | { kind: 'systemdScope'; unitName: string }
    | { kind: 'processGroup' };

export type ExecBinaryChunk = {
    stream: 'stdout' | 'stderr';
    chunk: string;
};

export type ExecBinaryInput = {
    binaryPath: string;
    args: string[];
    timeoutMillis?: number;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdio?: SpawnOptions['stdio'];
    signal?: AbortSignal;
    /** Grace before SIGKILL after SIGTERM on cancel/timeout. Default 5000. */
    killGraceMs?: number;
    /** Invoked from the stdout/stderr listeners while those listeners still concatenate. */
    onChunk?: (input: ExecBinaryChunk) => void;
    isolation?: ExecBinaryIsolation;
    /** Receives isolation cleanup failures. */
    logger?: Logger;
};

export type ExecBinaryFailure = {
    message: string;
    binaryPath: string;
    args: string[];
    code?: number;
    signal?: NodeJS.Signals;
    stdout?: string;
    stderr?: string;
    reason?: ExecBinaryFailureReason;
};

export function execBinary(
    input: ExecBinaryInput,
): Promise<Success<{ stdout: string; stderr: string }> | Failure<ExecBinaryFailure>> {
    const {
        binaryPath,
        args,
        timeoutMillis = 1000 * 60 * 10,
        cwd,
        env,
        stdio,
        signal,
        killGraceMs = 5000,
        onChunk,
        isolation: requestedIsolation,
        logger,
    } = input;
    const isolation = requestedIsolation?.kind === 'processGroup' && process.platform === 'win32'
        ? undefined
        : requestedIsolation;

    return new Promise((resolve) => {
        let settled = false;
        let canceling = false;
        let child: ChildProcess | undefined;
        let stdout = '';
        let stderr = '';
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let leftoverCleanup: Promise<boolean> | undefined;
        let untrackProcessGroup: (() => void) | undefined;

        const killIsolation = (pid: number) => {
            if (isolation?.kind === 'systemdScope') {
                return killSystemdScope({ unitName: isolation.unitName, graceMs: killGraceMs });
            }
            return killProcessGroup({ pgid: pid, graceMs: killGraceMs });
        };

        const cleanUpLeftovers = (): Promise<boolean> => {
            const pid = child?.pid;
            if (isolation === undefined || pid == null) return Promise.resolve(false);
            leftoverCleanup ??= killIsolation(pid).then((result) => {
                untrackProcessGroup?.();
                if (!result.success) logger?.warn(result.data);
                return result.success;
            });
            return leftoverCleanup;
        };

        const finish = (
            result: Success<{ stdout: string; stderr: string }> | Failure<ExecBinaryFailure>,
        ) => {
            if (settled) return;
            settled = true;
            if (timeout !== undefined) clearTimeout(timeout);
            untrackProcessGroup?.();
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
            resolve(result);
        };

        const cancelWith = async (reason: 'timeout' | 'aborted', message: string) => {
            if (settled || canceling) return;
            canceling = true;
            const pid = child?.pid;
            const isolationKilled = await cleanUpLeftovers();
            if (pid != null && !isolationKilled) {
                await killProcessTree({ pid, graceMs: killGraceMs });
            }
            finish(failure({
                message,
                binaryPath,
                args,
                stdout,
                stderr,
                reason,
            }));
        };

        const onAbort = () => {
            void cancelWith('aborted', 'Process aborted');
        };

        if (signal?.aborted) {
            void cancelWith('aborted', 'Process aborted');
            return;
        }

        if (signal) {
            signal.addEventListener('abort', onAbort, { once: true });
        }

        const resolved = resolveSpawnExecutable(binaryPath, args);
        const { executable: resolvedExecutable, args: resolvedArgs } = isolation?.kind === 'systemdScope'
            ? wrapInSystemdScope({ ...resolved, unitName: isolation.unitName })
            : resolved;

        const spawnOptions: SpawnOptions = {
            ...(cwd !== undefined ? { cwd } : {}),
            ...(env !== undefined ? { env } : {}),
            ...(stdio !== undefined ? { stdio } : {}),
            // On Unix, `detached` makes the child the leader of a new process group.
            ...(isolation?.kind === 'processGroup' ? { detached: true } : {}),
        };

        child = spawn(resolvedExecutable, resolvedArgs, spawnOptions);
        if (isolation?.kind === 'processGroup' && child.pid != null) {
            untrackProcessGroup = trackStepProcessGroup(child.pid);
        }

        // Start the timeout only after the OS has spawned the process so
        // timeoutMillis measures command runtime, not spawn/setup overhead.
        child.on('spawn', () => {
            if (settled || canceling) return;
            timeout = setTimeout(() => {
                void cancelWith(
                    'timeout',
                    `Process timed out after ${timeoutMillis} milliseconds`,
                );
            }, timeoutMillis);
        });

        const appendChunk = (stream: 'stdout' | 'stderr', data: unknown) => {
            const chunk = typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8');
            if (stream === 'stdout') stdout += chunk;
            else stderr += chunk;
            onChunk?.({ stream, chunk });
        };
        child.stdout?.on('data', (data) => { appendChunk('stdout', data); });
        child.stderr?.on('data', (data) => { appendChunk('stderr', data); });
        child.on('error', (err) => {
            if (settled || canceling) return;
            finish(failure({
                message: err.message,
                binaryPath,
                args,
                stdout,
                stderr,
                reason: 'spawn',
            }));
        });
        // Processes left in the scope can hold stdout/stderr open, so 'close'
        // only arrives once they are gone.
        child.on('exit', () => {
            if (settled || canceling) return;
            void cleanUpLeftovers();
        });
        child.on('close', async (code, exitSignal) => {
            if (settled || canceling) return;
            await cleanUpLeftovers();
            if (settled || canceling) return;
            if (code === 0) {
                finish(success({ stdout, stderr }));
                return;
            }
            const exitedBy = code === null && exitSignal
                ? `Process exited by signal ${exitSignal}`
                : `Process exited with code ${code}`;
            const preview = stderrMessagePreview(stderr);
            finish(failure({
                message: preview ? `${exitedBy}: ${preview}` : exitedBy,
                binaryPath,
                args,
                code: code ?? undefined,
                ...(code === null && exitSignal ? { signal: exitSignal } : {}),
                stdout,
                stderr,
                reason: 'exit',
            }));
        });
    });
}

export type ExecBinaryResponse = ReturnType<typeof execBinary>;
