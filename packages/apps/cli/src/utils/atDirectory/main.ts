import { shellSingleQuote } from '@lumpcode/core';

/**
 * Prefixes a shell command with `cd` into `directory` before running `command`.
 */
export function atDirectory(directory: string, command: string): string {
    const cd = process.platform === 'win32'
        ? `cd /d ${shellSingleQuote(directory)}`
        : `cd ${shellSingleQuote(directory)}`;
    return `${cd} && ${command}`;
}
