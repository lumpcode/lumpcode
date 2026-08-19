import { exec, type ExecException } from 'node:child_process';
import { promisify } from 'node:util';

import type { Failure, Success } from '../../types';
import { failure, success } from '../../utils';

const execAsyncBase = promisify(exec);

/** Same signal Node's `exec` `timeout` option uses by default. */
const EXEC_TIMEOUT_KILL_SIGNAL = 'SIGTERM';

export type ExecAsyncFailureReason = 'timeout' | 'exit';

export type ExecAsyncFailure = {
    message: string;
    reason: ExecAsyncFailureReason;
    info: {
        command: string;
        stdout: unknown;
        stderr: unknown;
    };
};

function isExecTimeout(error: unknown, timeoutMillis: number | undefined): boolean {
    if (timeoutMillis === undefined) {
        return false;
    }
    if (typeof error !== 'object' || error === null) {
        return false;
    }
    const execError = error as ExecException;
    if (execError.killed !== true) {
        return false;
    }
    // Windows has no POSIX signals; Node force-kills and `signal` is often null.
    if (process.platform === 'win32') {
        return true;
    }
    return execError.signal === EXEC_TIMEOUT_KILL_SIGNAL;
}

export async function execAsync(
    command: string,
    options?: { cwd?: string; timeoutMillis?: number },
): Promise<Success<{ stdout: string; stderr: string }> | Failure<ExecAsyncFailure>> {
    const timeoutMillis = options?.timeoutMillis;
    try {
        const result = await execAsyncBase(command, {
            cwd: options?.cwd,
            ...(timeoutMillis !== undefined
                ? { timeout: timeoutMillis, killSignal: EXEC_TIMEOUT_KILL_SIGNAL }
                : {}),
        });
        return success({
            stdout: String(result.stdout),
            stderr: String(result.stderr),
        });
    } catch (e: unknown) {
        const timedOut = isExecTimeout(e, timeoutMillis);
        const reason: ExecAsyncFailureReason = timedOut ? 'timeout' : 'exit';
        return failure({
            message: timedOut
                ? `Command ${command} timed out after ${timeoutMillis}ms`
                : `Command ${command} failed with error: ${e}`,
            reason,
            info: {
                command,
                stdout: e,
                stderr: e,
            },
        });
    }
}
