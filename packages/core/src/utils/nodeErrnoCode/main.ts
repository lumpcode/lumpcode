/** Node-style `code` from a caught unknown error (e.g. `ENOENT`), or undefined. */
export function nodeErrnoCode(_error: unknown): string | undefined {
    throw new Error('not implemented');
}
