/**
 * Wrap an arbitrary string in quotes so it can be safely embedded in
 * a shell command (e.g. the command string passed to `execAsync`).
 *
 * On Unix uses single quotes (no expansion). On Windows uses cmd.exe
 * double-quote rules (`""` for a literal `"`).
 */
export function shellSingleQuote(value: string): string {
    if (process.platform === 'win32') {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return `'${value.split("'").join(`'\\''`)}'`;
}
