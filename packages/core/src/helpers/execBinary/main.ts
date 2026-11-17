import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

import { Failure, Logger, Success } from '../../types';
import {
    failure,
    killProcessTree,
    killSystemdScope,
    resolveSpawnExecutable,
    success,
    wrapInSystemdScope,
} from '../../utils';

export type ExecBinaryFailureReason = 'timeout' | 'aborted' | 'exit' | 'spawn';

const STDERR_MESSAGE_PREVIEW_CHARS = 300;

function stderrMessagePreview(stderr: string): string {
    if (stderr.length <= STDERR_MESSAGE_PREVIEW_CHARS) return stderr;
    return `${stderr.slice(0, STDERR_MESSAGE_PREVIEW_CHARS)}…`;
}

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
    /**
     * Run inside this transient `systemd-run --user --scope` unit and kill
     * whatever is left in it once the child exits, times out, or is aborted.
     * Only pass a name after `detectSystemdScope()` reports it available.
     */
    systemdScopeUnit?: string;
    /** Receives scope cleanup failures. */
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
        systemdScopeUnit,
        logger,
    } = input;

    return new Promise((resolve) => {
        let settled = false;
        let canceling = false;
        let child: ChildProcess | undefined;
        let stdout = '';
        let stderr = '';
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let scopeCleanup: Promise<boolean> | undefined;

        const cleanUpScope = (): Promise<boolean> => {
            if (systemdScopeUnit === undefined) return Promise.resolve(false);
            scopeCleanup ??= killSystemdScope({ unitName: systemdScopeUnit, graceMs: killGraceMs })
                .then((result) => {
                    if (!result.success) logger?.warn(result.data);
                    return result.success;
                });
            return scopeCleanup;
        };

        const finish = (
            result: Success<{ stdout: string; stderr: string }> | Failure<ExecBinaryFailure>,
        ) => {
            if (settled) return;
            settled = true;
            if (timeout !== undefined) clearTimeout(timeout);
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
            resolve(result);
        };

        const cancelWith = async (reason: 'timeout' | 'aborted', message: string) => {
            if (settled || canceling) return;
            canceling = true;
            const pid = child?.pid;
            const scopeKilled = pid != null && await cleanUpScope();
            if (pid != null && !scopeKilled) {
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
        const { executable: resolvedExecutable, args: resolvedArgs } = systemdScopeUnit !== undefined
            ? wrapInSystemdScope({ ...resolved, unitName: systemdScopeUnit })
            : resolved;

        const spawnOptions: SpawnOptions = {
            ...(cwd !== undefined ? { cwd } : {}),
            ...(env !== undefined ? { env } : {}),
            ...(stdio !== undefined ? { stdio } : {}),
        };

        child = spawn(resolvedExecutable, resolvedArgs, spawnOptions);

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
            void cleanUpScope();
        });
        child.on('close', async (code, exitSignal) => {
            if (settled || canceling) return;
            await cleanUpScope();
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
