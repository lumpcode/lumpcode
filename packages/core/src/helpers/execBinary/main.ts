import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

import { Failure, Success } from '../../types';
import { failure, killProcessTree, resolveSpawnExecutable, success } from '../../utils';

export type ExecBinaryFailureReason = 'timeout' | 'aborted' | 'exit' | 'spawn';

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
};

export type ExecBinaryFailure = {
    message: string;
    binaryPath: string;
    args: string[];
    code?: number;
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
    } = input;

    return new Promise((resolve) => {
        let settled = false;
        let canceling = false;
        let child: ChildProcess | undefined;
        let stdout = '';
        let stderr = '';
        let timeout: ReturnType<typeof setTimeout> | undefined;

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
            if (pid != null) {
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

        const { executable: resolvedExecutable, args: resolvedArgs } = resolveSpawnExecutable(
            binaryPath,
            args,
        );

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

        child.stdout?.on('data', (data) => { stdout += data; });
        child.stderr?.on('data', (data) => { stderr += data; });
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
        child.on('close', (code) => {
            if (settled || canceling) return;
            if (code === 0) {
                finish(success({ stdout, stderr }));
                return;
            }
            finish(failure({
                message: `Process exited with code ${code}: ${stderr}`,
                binaryPath,
                args,
                code: code ?? undefined,
                stdout,
                stderr,
                reason: 'exit',
            }));
        });
    });
}

export type ExecBinaryResponse = ReturnType<typeof execBinary>;
