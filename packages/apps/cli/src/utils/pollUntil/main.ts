import * as fs from 'node:fs/promises';

export type PollUntilInput<T> = {
    timeoutMs: number;
    intervalMs?: number;
    poll: () => T | false | null | undefined | Promise<T | false | null | undefined>;
};

type PollUntilThrowInput<T> = PollUntilInput<T> & {
    timeoutError: string | (() => Error);
};

/** Polls until `poll` returns a value other than `undefined`, `null`, or `false`, or `timeoutMs` elapses. */
export function pollUntil<T>(input: PollUntilThrowInput<T>): Promise<T>;
export function pollUntil<T>(input: PollUntilInput<T>): Promise<T | undefined>;
export async function pollUntil<T>(
    input: PollUntilInput<T> & { timeoutError?: string | (() => Error) },
): Promise<T | undefined> {
    const { timeoutMs, intervalMs = 50, timeoutError, poll } = input;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const result = await poll();
        if (result !== undefined && result !== null && result !== false) return result;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    if (timeoutError) {
        throw typeof timeoutError === 'function' ? timeoutError() : new Error(timeoutError);
    }
    return undefined;
}

/** Polls until `filePath` is accessible or the timeout elapses. */
export async function pollUntilPathExists(input: {
    filePath: string;
    timeoutMs: number;
    intervalMs?: number;
    timeoutLabel?: string;
}): Promise<void> {
    const { filePath, timeoutMs, intervalMs = 50, timeoutLabel } = input;
    await pollUntil({
        timeoutMs,
        intervalMs,
        timeoutError: timeoutLabel
            ? `Timed out waiting for daemon ${timeoutLabel} at ${filePath}`
            : `Timed out waiting for ${filePath}`,
        poll: async () => {
            try {
                await fs.access(filePath);
                return true;
            } catch {
                return undefined;
            }
        },
    });
}
