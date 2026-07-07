import { describe, expect, it } from 'vitest';

import { parseGitLogHashSubjectLines } from './main';

describe('parseGitLogHashSubjectLines', () => {
    it('parses hash and subject from standard git log output', () => {
        const stdout = [
            'abc123def456 LUMP:myLump - button',
            'fed987cba654 LUMP:myLump - header',
        ].join('\n');

        expect(parseGitLogHashSubjectLines(stdout)).toEqual([
            { hash: 'abc123def456', subject: 'LUMP:myLump - button' },
            { hash: 'fed987cba654', subject: 'LUMP:myLump - header' },
        ]);
    });

    it('skips blank lines and trims whitespace', () => {
        const stdout = '\n  deadbeef LUMP:ctx  \n\n';

        expect(parseGitLogHashSubjectLines(stdout)).toEqual([
            { hash: 'deadbeef', subject: 'LUMP:ctx' },
        ]);
    });

    it('treats a line without a space as hash-only with an empty subject', () => {
        expect(parseGitLogHashSubjectLines('nospacesubject')).toEqual([
            { hash: 'nospacesubject', subject: '' },
        ]);
    });

    it('returns an empty array for empty output', () => {
        expect(parseGitLogHashSubjectLines('')).toEqual([]);
        expect(parseGitLogHashSubjectLines('\n  \n')).toEqual([]);
    });
});
