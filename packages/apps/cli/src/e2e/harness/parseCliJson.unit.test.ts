import { describe, expect, it } from 'vitest';

import { parseCliJson } from './runCli';

describe('parseCliJson', () => {
    it('parses the last JSON envelope line from stdout', () => {
        const envelope = { messages: ['ok'], data: { n: 1 } };
        expect(
            parseCliJson({
                stdout: `noise\n${JSON.stringify(envelope)}\n`,
                stderr: '',
            }),
        ).toEqual(envelope);
    });

    it('parses envelope from stderr when command failed', () => {
        const envelope = { messages: ['fail'] };
        expect(
            parseCliJson({ stdout: '', stderr: `${JSON.stringify(envelope)}\n` }),
        ).toEqual(envelope);
    });

    it('throws when no envelope line exists', () => {
        expect(() => parseCliJson({ stdout: 'not json\n', stderr: '{ broken' })).toThrow(
            /CLI --json: expected one JSON envelope line/,
        );
    });
});
