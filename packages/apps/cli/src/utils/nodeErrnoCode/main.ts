/** Node-style `code` from a caught unknown error (e.g. `ENOENT`), or undefined. */
export function nodeErrnoCode(error: unknown): string | undefined {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as NodeJS.ErrnoException).code;
        return typeof code === 'string' ? code : undefined;
    }
    return undefined;
}
