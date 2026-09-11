import type { Success } from '@lumpcode/core';

export type SharedRunReviewChoice = 'commit' | 'exit';

/**
 * TTY commit / exit after a shared walk. Always Success.
 * `--json` or `!stdin.isTTY` → `exit` without reading stdin. Ctrl+C / EOF → `exit`.
 */
export async function promptSharedRunReview(_input: {
    stdin: NodeJS.ReadStream;
    stdout: NodeJS.WriteStream;
    json: boolean;
    porcelainLines: string[];
}): Promise<Success<SharedRunReviewChoice>> {
    throw new Error('not implemented');
}
