import { describe, expect, it } from 'vitest';

import { commitMessageIncludesMarker } from './main';

const marker = 'LUMP: myLump - foo';

describe('commitMessageIncludesMarker', () => {
    it('matches an exact message', () => {
        expect(commitMessageIncludesMarker(marker, marker)).toBe(true);
    });

    it('matches a GitHub-style bullet line', () => {
        expect(commitMessageIncludesMarker(`Fix the button\n\n* ${marker}\n`, marker)).toBe(true);
    });

    it('matches comma-separated concatenation', () => {
        expect(commitMessageIncludesMarker(`${marker}, LUMP: myLump - bar`, marker)).toBe(true);
    });

    it('matches dash-separated concatenation', () => {
        expect(commitMessageIncludesMarker(`${marker} - LUMP: myLump - bar`, marker)).toBe(true);
    });

    it('does not match a longer context name that shares a prefix', () => {
        expect(commitMessageIncludesMarker('LUMP: myLump - foo-bar', marker)).toBe(false);
        expect(commitMessageIncludesMarker('LUMP: myLump - foo_bar', marker)).toBe(false);
    });

    it('matches a later exact marker after a prefix collision', () => {
        const message = `LUMP: myLump - foo-bar\n${marker}`;
        expect(commitMessageIncludesMarker(message, marker)).toBe(true);
    });

    it('does not match when the marker is absent', () => {
        expect(commitMessageIncludesMarker('unrelated commit', marker)).toBe(false);
        expect(commitMessageIncludesMarker('', marker)).toBe(false);
    });

    it('does not match an empty marker', () => {
        expect(commitMessageIncludesMarker(marker, '')).toBe(false);
    });

    it('escapes regex metacharacters in the marker', () => {
        expect(commitMessageIncludesMarker('custom::feat done', 'custom::feat')).toBe(true);
        expect(commitMessageIncludesMarker('customXXfeat', 'custom::feat')).toBe(false);
    });
});
