import { access } from 'node:fs/promises';
import { spawn as nodeSpawn } from 'node:child_process';
import * as z from 'zod';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { DEFAULT_TAIL_LINES, tailFile } from '../tailFile';

/** Shared `--lines` / `--noFollow` fields for daemon-log, supervisor-log, and transcript. */
export const followableTailOptionFields = {
    lines: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Number of initial lines to show (omitted = 10; 0 = whole file)'),
    noFollow: z.boolean().optional().describe('Print lines and exit instead of following live'),
};

/**
 * Optional missing-file message, then `tailFile`.
 * Follow mode returns `followedMessage` and no `data`.
 * `--noFollow` returns the captured lines as `messages` and as `data(lines)`.
 * Omitted `lines` means `DEFAULT_TAIL_LINES` (10). `lines: 0` is the whole file.
 */
export async function completeLogTail<TData>(input: {
    filePath: string;
    lines?: number;
    noFollow: boolean;
    spawnFn?: typeof nodeSpawn;
    /** When set, any `access` failure returns this message and does not call `tailFile`. */
    missingMessage?: string;
    followedMessage: string;
    data: (outputLines: string[]) => TData;
}): Promise<Success<{ messages: string[]; data?: TData }> | Failure<{ messages: string[] }>> {
    const lines = input.lines ?? DEFAULT_TAIL_LINES;
    if (input.missingMessage !== undefined) {
        try {
            await access(input.filePath);
        } catch {
            return failure({ messages: [input.missingMessage] });
        }
    }

    const tailResult = await tailFile({
        filePath: input.filePath,
        lines,
        follow: !input.noFollow,
        spawnFn: input.spawnFn,
    });
    if (!tailResult.success) {
        return failure({ messages: [tailResult.data] });
    }
    if (!input.noFollow) {
        return success({ messages: [input.followedMessage] });
    }
    const outputLines = 'lines' in tailResult.data ? tailResult.data.lines : [];
    return success({
        messages: outputLines,
        data: input.data(outputLines),
    });
}
