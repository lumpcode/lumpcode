import { spawn, type SpawnOptions } from 'node:child_process';
import { Failure, Success } from '../../types';
import { failure, resolveSpawnExecutable, success } from '../../utils';

export function execBinary(
    binaryPath: string,
    args: string[],
    timeoutMillis: number = 1000 * 60 * 10,
    options?: SpawnOptions,
): Promise<
    Success<{
        stdout: string;
        stderr: string;
    }> | Failure<{
        message: string;
        binaryPath: string;
        args: string[];
        code?: number;
        stdout?: string;
        stderr?: string;
    }>
> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (
            result: Success<{ stdout: string; stderr: string }> | Failure<{
                message: string;
                binaryPath: string;
                args: string[];
                code?: number;
                stdout?: string;
                stderr?: string;
            }>,
        ) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve(result);
        };

        const timeout = setTimeout(() => {
            finish(failure({
                message: `Process timed out after ${timeoutMillis} milliseconds`,
                binaryPath,
                args,
            }));
        }, timeoutMillis);

        const { executable: resolvedExecutable, args: resolvedArgs } = resolveSpawnExecutable(
            binaryPath,
            args,
        );
        const child = spawn(resolvedExecutable, resolvedArgs, options || {});
        let stdout = '', stderr = '';

        child.stdout?.on('data', (data) => { stdout += data; });
        child.stderr?.on('data', (data) => { stderr += data; });
        child.on('error', (err) => {
            finish(failure({
                message: err.message,
                binaryPath,
                args,
                stdout,
                stderr,
            }));
        });
        child.on('close', (code) => {
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
            }));
        });
    });
}

export type ExecBinaryResponse = ReturnType<typeof execBinary>;
