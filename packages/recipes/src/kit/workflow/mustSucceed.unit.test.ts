import { describe, expect, it } from 'vitest';

import type { AgentResult, ShellResult } from '@lumpcode/core';

import { mustSucceed } from './mustSucceed';

// Skipped until the impl stage fills in the workflow helper. Unskip; do not rewrite.
describe('mustSucceed', () => {
    it('returns a succeeded shell result unchanged', () => {
        const result: ShellResult = { output: 'ok', succeeded: true, exitCode: 0, timedOut: false };
        expect(mustSucceed(result)).toBe(result);
        expect(mustSucceed(result, 'ignored when green')).toBe(result);
    });

    it('returns a succeeded agent result unchanged', () => {
        const result: AgentResult = { output: 'done', succeeded: true, exitCode: 0, timedOut: false };
        expect(mustSucceed(result)).toBe(result);
    });

    it('throws the message and the tail of the output, with the result as cause', () => {
        const marker = 'START-MARKER-';
        const output = `${marker}${'x'.repeat(3000)}`;
        const result: ShellResult = { output, succeeded: false, exitCode: 1, timedOut: false };

        const thrown = catchFailure(() => mustSucceed(result, 'lint failed'));

        expect(thrown).toBeInstanceOf(Error);
        expect(thrown.cause).toBe(result);
        expect(thrown.message.startsWith('lint failed')).toBe(true);
        expect(thrown.message.endsWith(output.slice(-2000))).toBe(true);
        expect(thrown.message).not.toContain(marker);
    });

    it('uses a failed message when no message is passed', () => {
        const result: AgentResult = {
            output: 'agent said no',
            succeeded: false,
            exitCode: 1,
            timedOut: false,
        };

        const thrown = catchFailure(() => mustSucceed(result));

        expect(thrown.cause).toBe(result);
        expect(thrown.message).toMatch(/failed/);
        expect(thrown.message.endsWith('agent said no')).toBe(true);
    });

    it('throws when the output is empty', () => {
        const result: ShellResult = { output: '', succeeded: false, exitCode: 1, timedOut: true };

        const thrown = catchFailure(() => mustSucceed(result, 'timed out'));

        expect(thrown.cause).toBe(result);
        expect(thrown.message.startsWith('timed out')).toBe(true);
    });
});

function catchFailure(run: () => unknown): Error {
    try {
        run();
    } catch (error) {
        if (error instanceof Error) {
            return error;
        }
        throw error;
    }
    throw new Error('expected mustSucceed to throw');
}
