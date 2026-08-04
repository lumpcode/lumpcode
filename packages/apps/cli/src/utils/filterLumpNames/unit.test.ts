import { describe, expect, it } from 'vitest';

import {
    filterLumpNames,
    isLumpNameFilterActive,
    isLumpNameGlobPattern,
    matchLumpNamePattern,
    parseLumpNameFilterPatterns,
} from './main';

describe('filterLumpNames', () => {
    const names = ['backlog', 'refacto-a', 'refacto-wip', 'other'];

    it('matches exact and * globs', () => {
        expect(matchLumpNamePattern({ pattern: 'backlog', name: 'backlog' })).toBe(true);
        expect(matchLumpNamePattern({ pattern: 'backlog', name: 'other' })).toBe(false);
        expect(matchLumpNamePattern({ pattern: 'refacto-*', name: 'refacto-a' })).toBe(true);
        expect(matchLumpNamePattern({ pattern: 'refacto-*', name: 'other' })).toBe(false);
        expect(matchLumpNamePattern({ pattern: 'foo?', name: 'foo?' })).toBe(true);
        expect(matchLumpNamePattern({ pattern: 'foo?', name: 'foox' })).toBe(false);
        expect(isLumpNameGlobPattern('foo-*')).toBe(true);
        expect(isLumpNameGlobPattern('foo')).toBe(false);
    });

    it('include empty means all, then exclude', () => {
        expect(filterLumpNames({ names, exclude: ['other'] })).toEqual([
            'backlog',
            'refacto-a',
            'refacto-wip',
        ]);
    });

    it('include then exclude', () => {
        expect(
            filterLumpNames({
                names,
                include: ['refacto-*', 'backlog'],
                exclude: ['refacto-wip'],
            }),
        ).toEqual(['backlog', 'refacto-a']);
    });

    it('parseLumpNameFilterPatterns splits commas', () => {
        expect(parseLumpNameFilterPatterns('a, b,,c')).toEqual(['a', 'b', 'c']);
        expect(parseLumpNameFilterPatterns(['a,b', 'c'])).toEqual(['a', 'b', 'c']);
        expect(isLumpNameFilterActive({})).toBe(false);
        expect(isLumpNameFilterActive({ include: ['x'] })).toBe(true);
    });
});
