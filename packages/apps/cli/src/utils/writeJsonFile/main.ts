import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

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
        await fs.writeFile(filePath, content, mode === undefined ? encoding : { encoding, mode });
        return success(undefined);
    } catch (error: unknown) {
        return failure(`Cannot write ${filePath}: ${String(error)}`);
    }
}
