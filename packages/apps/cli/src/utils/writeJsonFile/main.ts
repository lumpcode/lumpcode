import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { Failure, Success } from '@lumpcode/core';
import { failure, nodeErrnoCode, success } from '@lumpcode/core';

export type WriteJsonFileInput = {
    filePath: string;
    data: unknown;
    /** When `true`, use 2-space indent; when a number, pass as `JSON.stringify` space. Default: compact. */
    pretty?: boolean | number;
    /** Append `\n` after the JSON document. Default: `false`. */
    trailingNewline?: boolean;
    encoding?: BufferEncoding;
    /** When `true`, `mkdir` `path.dirname(filePath)` with `{ recursive: true }` before write. */
    mkdir?: boolean;
    mode?: number;
};

function resolvePrettySpace(pretty: boolean | number | undefined): number | undefined {
    if (pretty === true) return 2;
    if (typeof pretty === 'number') return pretty;
    return undefined;
}

/** Pure formatter shared with callers that write via an open handle (e.g. workspace locks). */
export function formatJsonFileContent(
    input: Pick<WriteJsonFileInput, 'data' | 'pretty' | 'trailingNewline'>,
): string {
    const { data, pretty, trailingNewline = false } = input;
    const space = resolvePrettySpace(pretty);
    const json = space === undefined ? JSON.stringify(data) : JSON.stringify(data, null, space);
    return trailingNewline ? `${json}\n` : json;
}

function tempPathFor(filePath: string): string {
    const suffix = `${process.pid}.${randomBytes(6).toString('hex')}`;
    return path.join(path.dirname(filePath), `.${path.basename(filePath)}.${suffix}.tmp`);
}

async function modeToApply(filePath: string, mode: number | undefined): Promise<number | undefined> {
    if (mode !== undefined) return mode;
    try {
        const current = await fs.stat(filePath);
        return current.mode & 0o777;
    } catch (error: unknown) {
        if (nodeErrnoCode(error) === 'ENOENT') return undefined;
        throw error;
    }
}

/** Windows `rename` cannot replace an existing file (`EPERM` / `EEXIST`). */
function isWindowsReplaceUnsupported(error: unknown): boolean {
    const code = nodeErrnoCode(error);
    return code === 'EPERM' || code === 'EEXIST';
}

/**
 * Writes `content` to a temp file in the same directory, then renames it over `filePath`.
 * On POSIX, readers of `filePath` see the previous document or the new one.
 * Daemon meta is read fail-closed; an in-place truncate makes that read `invalid`.
 */
async function publishFileAtomically(input: {
    filePath: string;
    content: string;
    encoding: BufferEncoding;
    mode?: number;
}): Promise<void> {
    const { filePath, content, encoding } = input;
    const mode = await modeToApply(filePath, input.mode);
    const tmpPath = tempPathFor(filePath);
    try {
        await fs.writeFile(tmpPath, content, mode === undefined ? encoding : { encoding, mode });
        try {
            await fs.rename(tmpPath, filePath);
        } catch (error: unknown) {
            if (process.platform !== 'win32' || !isWindowsReplaceUnsupported(error)) {
                throw error;
            }
            try {
                await fs.unlink(filePath);
            } catch (unlinkError: unknown) {
                if (nodeErrnoCode(unlinkError) !== 'ENOENT') throw unlinkError;
            }
            await fs.rename(tmpPath, filePath);
        }
    } catch (error: unknown) {
        await fs.unlink(tmpPath).catch(() => undefined);
        throw error;
    }
}

export async function writeJsonFile(
    input: WriteJsonFileInput,
): Promise<Success<void> | Failure<string>> {
    const {
        filePath,
        data,
        pretty,
        trailingNewline = false,
        encoding = 'utf-8',
        mkdir: shouldMkdir = false,
        mode,
    } = input;

    try {
        if (shouldMkdir) {
            await fs.mkdir(path.dirname(filePath), { recursive: true });
        }
        const content = formatJsonFileContent({ data, pretty, trailingNewline });
        await publishFileAtomically({ filePath, content, encoding, mode });
        return success(undefined);
    } catch (error: unknown) {
        return failure(`Cannot write ${filePath}: ${String(error)}`);
    }
}
