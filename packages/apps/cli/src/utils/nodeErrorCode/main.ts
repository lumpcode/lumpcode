/**
 * Returns the `code` from a Node.js system error (e.g. ENOENT, EEXIST, ESRCH), or undefined.
 */
export function nodeErrorCode(error: unknown): string | undefined {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as NodeJS.ErrnoException).code;
        return typeof code === 'string' ? code : undefined;
    }
    return undefined;
}
