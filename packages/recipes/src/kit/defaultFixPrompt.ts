import type { CommandDescriptor } from '@lumpcode/core';
import { shellSingleQuote } from '@lumpcode/core';

/** The command line shown in a fix prompt and in a `retry:` label. */
export function formatVerificationCommand(descriptor: CommandDescriptor | null): string {
    if (!descriptor) {
        return '(no verification command recorded)';
    }

    if (descriptor.executable === 'sh' && descriptor.args[0] === '-c' && descriptor.args.length === 2) {
        return descriptor.args[1] ?? '';
    }

    const command = [descriptor.executable, ...descriptor.args.map(shellSingleQuote)].join(' ');
    if (!descriptor.env || Object.keys(descriptor.env).length === 0) {
        return command;
    }

    const envPrefix = Object.entries(descriptor.env)
        .map(([key, value]) => `${key}=${shellSingleQuote(value)}`)
        .join(' ');
    return `${envPrefix} ${command}`;
}

export function formatCheckCommand(check: string | CommandDescriptor): string {
    if (typeof check === 'string') {
        return check;
    }
    return formatVerificationCommand(check);
}

/** Shared with the steps loop. `output` is included as given, including when it is empty. */
export function defaultFixPromptText(command: string, output: string): string {
    return [
        'The verification step failed. Fix the issues and try again.',
        '',
        'Verification command:',
        '',
        command,
        '',
        'Verification output:',
        '',
        output,
    ].join('\n');
}
