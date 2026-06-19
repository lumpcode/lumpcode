/**
 * Wrap a shell fragment so failure does not break a surrounding `&&` chain.
 *
 * Unix: `cmd || true`. Windows cmd.exe: `(cmd || cd .)`.
 */
export function shellBestEffort(command: string): string {
    if (process.platform === 'win32') {
        return `(${command} || cd .)`;
    }
    return `${command} || true`;
}
