import { describe, expect, it } from 'vitest';

import { formatDeamonLumpScopeCliOutput } from './main';

describe('formatDeamonLumpScopeCliOutput', () => {
    it('formats a single lump without quotes by default', () => {
        expect(
            formatDeamonLumpScopeCliOutput({
                lumpName: 'alpha',
                lumpNames: ['alpha'],
            }),
        ).toBe('Lump: alpha');
    });

    it('formats a single lump with quotes when requested', () => {
        expect(
            formatDeamonLumpScopeCliOutput({
                lumpName: 'alpha',
                lumpNames: ['alpha'],
                quoteLumpName: true,
            }),
        ).toBe('Lump: "alpha"');
    });

    it('formats multiple lumps', () => {
        expect(
            formatDeamonLumpScopeCliOutput({
                lumpNames: ['alpha', 'beta'],
            }),
        ).toBe('Lumps: alpha, beta');
    });
});
