import { describe, expect, it } from 'vitest';

import { filterLumpNames, matchLumpNamePattern } from './main';

/**
 * daemon-id-and-filters FL1–FL11.
 * Skipped until filterLumpNames is implemented.
 */
describe('filterLumpNames (daemon-id-and-filters FL*)', () => {
    it('FL1: omit include returns all names in source order', () => {
        expect(
            filterLumpNames({ names: ['a', 'b', 'c'] }),
        ).toEqual(['a', 'b', 'c']);
    });

    it('FL2: exact include', () => {
        expect(
            filterLumpNames({ names: ['a', 'b', 'c'], include: ['b'] }),
        ).toEqual(['b']);
    });

    it('FL3: multi exact preserves source order', () => {
        expect(
            filterLumpNames({ names: ['a', 'b', 'c'], include: ['c', 'a'] }),
        ).toEqual(['a', 'c']);
    });

    it('FL4: glob * matches full string', () => {
        expect(
            filterLumpNames({
                names: ['refacto-a', 'refacto-wip', 'other'],
                include: ['refacto-*'],
            }),
        ).toEqual(['refacto-a', 'refacto-wip']);
    });

    it('FL5: exclude after include', () => {
        expect(
            filterLumpNames({
                names: ['refacto-a', 'refacto-wip', 'other'],
                include: ['refacto-*'],
                exclude: ['refacto-wip'],
            }),
        ).toEqual(['refacto-a']);
    });

    it('FL6: exclude only', () => {
        expect(
            filterLumpNames({ names: ['a', 'b', 'c'], exclude: ['b'] }),
        ).toEqual(['a', 'c']);
    });

    it('FL7: no match → empty', () => {
        expect(
            filterLumpNames({ names: ['a', 'b'], include: ['missing'] }),
        ).toEqual([]);
    });

    it('FL8: * is full-string only (no substring glob)', () => {
        expect(
            matchLumpNamePattern({ pattern: 'facto-*', name: 'refacto-a' }),
        ).toBe(false);
        expect(
            filterLumpNames({
                names: ['refacto-a'],
                include: ['facto-*'],
            }),
        ).toEqual([]);
    });

    it('FL9: * → zero-or-more chars (full-string glob)', () => {
        expect(matchLumpNamePattern({ pattern: 'a*b', name: 'axb' })).toBe(true);
        expect(matchLumpNamePattern({ pattern: 'a*b', name: 'ab' })).toBe(true);
        expect(matchLumpNamePattern({ pattern: 'a*b', name: 'aXb' })).toBe(true);
        expect(matchLumpNamePattern({ pattern: 'a*b', name: 'a*b' })).toBe(true);
        expect(matchLumpNamePattern({ pattern: 'a*b', name: 'abx' })).toBe(false);
        expect(matchLumpNamePattern({ pattern: 'a*b', name: 'xab' })).toBe(false);
    });

    it('FL10: ? is not a single-char wildcard', () => {
        expect(matchLumpNamePattern({ pattern: 'a?b', name: 'axb' })).toBe(false);
        // Literal `?` only matches a name that contains `?`
        expect(matchLumpNamePattern({ pattern: 'a?b', name: 'a?b' })).toBe(true);
    });

    it('FL11: no path-like special behavior', () => {
        expect(matchLumpNamePattern({ pattern: 'foo/bar', name: 'foo/bar' })).toBe(true);
        expect(matchLumpNamePattern({ pattern: 'foo/bar', name: 'foo' })).toBe(false);
        expect(matchLumpNamePattern({ pattern: 'foo/*', name: 'foo/bar' })).toBe(true);
        // `*` still full-string; does not traverse path segments specially
        expect(matchLumpNamePattern({ pattern: '*/bar', name: 'foo/bar' })).toBe(true);
    });
});
