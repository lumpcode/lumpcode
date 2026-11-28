import { describe, expect, it } from 'vitest';

import type {
    AgentSession,
    CommandDescriptor,
    PromptOptions,
    Shell,
    ShellOptions,
    ShellResult,
} from '@lumpcode/core';
import { shellSingleQuote } from '@lumpcode/core';

import { retryUntilGreen } from './retryUntilGreen';

// Skipped until the impl stage fills in the workflow helper. Unskip; do not rewrite.
describe.skip('retryUntilGreen', () => {
    it('returns succeeded on the first green check and does not prompt', async () => {
        const green = checkResult({ succeeded: true, output: 'ok' });
        const sequence: string[] = [];
        const { session, prompts } = createSession(sequence);
        const { shell, calls } = createShell([green], sequence);

        const result = await retryUntilGreen({ session, shell, check: 'npm run test' });

        expect(result).toEqual({ succeeded: true, attempts: 1, lastCheck: green });
        expect(prompts).toEqual([]);
        expect(calls).toEqual([
            { command: 'npm run test', options: { label: 'retry: npm run test' } },
        ]);
        expect(sequence).toEqual(['shell']);
    });

    it('sends the optional prompt before the first check', async () => {
        const green = checkResult({ succeeded: true, output: 'ok' });
        const sequence: string[] = [];
        const { session, prompts } = createSession(sequence);
        const { shell } = createShell([green], sequence);

        const result = await retryUntilGreen({
            session,
            shell,
            check: 'npm run test',
            prompt: 'Implement the ticket',
        });

        expect(result.succeeded).toBe(true);
        expect(result.attempts).toBe(1);
        expect(prompts.map((prompt) => prompt.text)).toEqual(['Implement the ticket']);
        expect(sequence).toEqual(['prompt', 'shell']);
    });

    it('prompts a fix and checks again until the check is green', async () => {
        const firstRed = checkResult({ succeeded: false, output: 'fail 1' });
        const secondRed = checkResult({ succeeded: false, output: 'fail 2' });
        const green = checkResult({ succeeded: true, output: 'ok' });
        const sequence: string[] = [];
        const { session, prompts } = createSession(sequence);
        const { shell, calls } = createShell([firstRed, secondRed, green], sequence);

        const result = await retryUntilGreen({
            session,
            shell,
            check: 'npm run test',
            maxAttempts: 3,
            prompt: 'Implement the ticket',
        });

        expect(result).toEqual({ succeeded: true, attempts: 3, lastCheck: green });
        expect(calls).toHaveLength(3);
        expect(prompts.map((prompt) => prompt.text)).toEqual([
            'Implement the ticket',
            defaultFixPrompt('npm run test', 'fail 1'),
            defaultFixPrompt('npm run test', 'fail 2'),
        ]);
        expect(prompts[1]?.options?.label).toBe('retry fix 1/3');
        expect(prompts[2]?.options?.label).toBe('retry fix 2/3');
        expect(sequence).toEqual(['prompt', 'shell', 'prompt', 'shell', 'prompt', 'shell']);
    });

    it('uses a custom fix prompt with the failed result and a 1-based attempt', async () => {
        const red = checkResult({ succeeded: false, output: 'boom' });
        const green = checkResult({ succeeded: true, output: 'ok' });
        const seen: { failed: ShellResult; attempt: number }[] = [];
        const { session, prompts } = createSession();
        const { shell } = createShell([red, green]);

        const result = await retryUntilGreen({
            session,
            shell,
            check: 'npm test',
            fixPrompt(failed, attempt) {
                seen.push({ failed, attempt });
                return `fix #${attempt}: ${failed.output}`;
            },
        });

        expect(result).toEqual({ succeeded: true, attempts: 2, lastCheck: green });
        expect(seen).toEqual([{ failed: red, attempt: 1 }]);
        expect(prompts.map((prompt) => prompt.text)).toEqual(['fix #1: boom']);
        expect(prompts[0]?.options?.label).toBe('retry fix 1/3');
    });

    it('stops after the default 3 fix attempts when the check stays red', async () => {
        const reds = [0, 1, 2, 3].map((index) => checkResult({
            succeeded: false,
            output: `red ${index}`,
        }));
        const { session, prompts } = createSession();
        const { shell, calls } = createShell(reds);

        const result = await retryUntilGreen({ session, shell, check: 'npm test' });

        expect(result).toEqual({ succeeded: false, attempts: 4, lastCheck: reds[3] });
        expect(calls).toHaveLength(4);
        expect(prompts.map((prompt) => prompt.options?.label)).toEqual([
            'retry fix 1/3',
            'retry fix 2/3',
            'retry fix 3/3',
        ]);
        expect(prompts[0]?.text).toBe(defaultFixPrompt('npm test', 'red 0'));
    });

    it('does not prompt a fix when maxAttempts is 0', async () => {
        const red = checkResult({ succeeded: false, output: 'red' });
        const { session, prompts } = createSession();
        const { shell } = createShell([red]);

        await expect(retryUntilGreen({
            session,
            shell,
            check: 'npm test',
            maxAttempts: 0,
        })).resolves.toEqual({ succeeded: false, attempts: 1, lastCheck: red });
        expect(prompts).toEqual([]);
    });

    it('does not throw when the check stays red', async () => {
        const red = checkResult({ succeeded: false, output: 'red' });
        const { session } = createSession();
        const { shell } = createShell([red, red]);

        await expect(retryUntilGreen({
            session,
            shell,
            check: 'npm test',
            maxAttempts: 1,
        })).resolves.toMatchObject({ succeeded: false, attempts: 2 });
    });

    it('formats a shell string, an sh -c descriptor, and env the way the steps fix prompt does', async () => {
        const red = checkResult({ succeeded: false, output: 'nope' });
        const green = checkResult({ succeeded: true, output: 'ok' });
        const descriptor: CommandDescriptor = {
            executable: 'npm',
            args: ['run', 'test'],
            env: { CI: '1', NODE_ENV: 'test' },
        };
        const wrapped: CommandDescriptor = { executable: 'sh', args: ['-c', 'npm run test'] };

        const stringRun = createSession();
        const stringShell = createShell([red, green]);
        await retryUntilGreen({
            session: stringRun.session,
            shell: stringShell.shell,
            check: 'npm run test',
            maxAttempts: 1,
        });
        expect(stringShell.calls[0]?.options?.label).toBe('retry: npm run test');
        expect(stringRun.prompts[0]?.text).toBe(defaultFixPrompt('npm run test', 'nope'));

        const wrappedRun = createSession();
        const wrappedShell = createShell([red, green]);
        await retryUntilGreen({
            session: wrappedRun.session,
            shell: wrappedShell.shell,
            check: wrapped,
            maxAttempts: 1,
        });
        expect(wrappedShell.calls[0]?.command).toEqual(wrapped);
        expect(wrappedShell.calls[0]?.options?.label).toBe('retry: npm run test');
        expect(wrappedRun.prompts[0]?.text).toBe(defaultFixPrompt('npm run test', 'nope'));

        const envRun = createSession();
        const envShell = createShell([red, green]);
        const formatted = formatCheck(descriptor);
        await retryUntilGreen({
            session: envRun.session,
            shell: envShell.shell,
            check: descriptor,
            maxAttempts: 1,
        });
        expect(envShell.calls[0]?.command).toEqual(descriptor);
        expect(envShell.calls[0]?.options?.label).toBe(`retry: ${formatted}`);
        expect(envRun.prompts[0]?.text).toBe(defaultFixPrompt(formatted, 'nope'));
    });

    it('includes an empty check output in the default fix prompt', async () => {
        const red = checkResult({ succeeded: false, output: '' });
        const { session, prompts } = createSession();
        const { shell } = createShell([red, checkResult({ succeeded: true, output: 'ok' })]);

        await retryUntilGreen({ session, shell, check: 'npm test', maxAttempts: 1 });

        expect(prompts[0]?.text).toBe(defaultFixPrompt('npm test', ''));
    });

    it('propagates an abort from the check', async () => {
        const error = abortError();
        const { session } = createSession();
        const shell: Shell = async () => {
            throw error;
        };

        await expect(retryUntilGreen({ session, shell, check: 'npm test' })).rejects.toBe(error);
    });

    it('propagates an abort from the fix prompt', async () => {
        const error = abortError();
        const { shell } = createShell([checkResult({ succeeded: false, output: 'red' })]);
        const session: AgentSession = {
            command: 'cursor',
            sessionId: 's1',
            async prompt() {
                throw error;
            },
        };

        await expect(retryUntilGreen({
            session,
            shell,
            check: 'npm test',
            maxAttempts: 1,
        })).rejects.toBe(error);
    });

    it('propagates a non-abort throw from the check', async () => {
        const error = new Error('shell blew up');
        const { session } = createSession();
        const shell: Shell = async () => {
            throw error;
        };

        await expect(retryUntilGreen({ session, shell, check: 'npm test' })).rejects.toBe(error);
    });
});

function checkResult({ succeeded, output }: { succeeded: boolean; output: string }): ShellResult {
    return {
        output,
        succeeded,
        exitCode: succeeded ? 0 : 1,
        timedOut: false,
    };
}

function abortError(): Error {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    return error;
}

function formatCheck(check: string | CommandDescriptor): string {
    if (typeof check === 'string') {
        return check;
    }
    if (check.executable === 'sh' && check.args[0] === '-c' && check.args.length === 2) {
        return check.args[1] ?? '';
    }
    const command = [check.executable, ...check.args.map(shellSingleQuote)].join(' ');
    if (!check.env || Object.keys(check.env).length === 0) {
        return command;
    }
    const envPrefix = Object.entries(check.env)
        .map(([key, value]) => `${key}=${shellSingleQuote(value)}`)
        .join(' ');
    return `${envPrefix} ${command}`;
}

function defaultFixPrompt(command: string, output: string): string {
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

function createSession(sequence?: string[]) {
    const prompts: { text: string; options?: PromptOptions }[] = [];
    const session: AgentSession = {
        command: 'cursor',
        sessionId: 's1',
        async prompt(text, options) {
            sequence?.push('prompt');
            prompts.push({ text, options });
            return { output: 'ok', succeeded: true, exitCode: 0, timedOut: false };
        },
    };
    return { session, prompts };
}

function createShell(results: ShellResult[], sequence?: string[]) {
    const calls: { command: string | CommandDescriptor; options?: ShellOptions }[] = [];
    let index = 0;
    const shell: Shell = async (command, options) => {
        sequence?.push('shell');
        calls.push({ command, options });
        const result = results[index];
        index += 1;
        if (!result) {
            throw new Error(`unexpected shell call ${index}`);
        }
        return result;
    };
    return { shell, calls };
}
