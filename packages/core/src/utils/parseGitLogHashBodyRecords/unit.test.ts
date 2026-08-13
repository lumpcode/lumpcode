import { describe, expect, it } from 'vitest';

import { parseGitLogHashBodyRecords } from './main';

describe('parseGitLogHashBodyRecords', () => {
    it('parses hash and full message from RS/NUL-delimited git log output', () => {
        const stdout = [
            '\x1eabc123def456\x00LUMP: myLump - button\n',
            '\x1efed987cba654\x00PR title\n\n* LUMP: myLump - header\n',
        ].join('');

        expect(parseGitLogHashBodyRecords(stdout)).toEqual([
            { hash: 'abc123def456', message: 'LUMP: myLump - button\n' },
            { hash: 'fed987cba654', message: 'PR title\n\n* LUMP: myLump - header\n' },
        ]);
    });

    it('skips empty records and records without a NUL separator', () => {
        const stdout = `\x1e\x1edeadbeef\x00body\n\x1enoseparator\n`;
        expect(parseGitLogHashBodyRecords(stdout)).toEqual([
            { hash: 'deadbeef', message: 'body\n' },
        ]);
    });

    it('returns an empty array for empty output', () => {
        expect(parseGitLogHashBodyRecords('')).toEqual([]);
        expect(parseGitLogHashBodyRecords('\n  \n')).toEqual([]);
    });
});
