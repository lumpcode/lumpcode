import { describe, expect, it } from 'vitest';

import { resolvePresetExtraArgs } from './resolvePresetExtraArgs.js';

describe('resolvePresetExtraArgs', () => {
    it('returns the lump list when the step does not set extraArgs', () => {
        expect(resolvePresetExtraArgs({
            lumpVariables: { extraArgs: ['-c', 'model_reasoning_effort=high'] },
            stepVariables: {},
        })).toEqual(['-c', 'model_reasoning_effort=high']);
    });

    it('returns the step list when the lump does not set extraArgs', () => {
        expect(resolvePresetExtraArgs({
            lumpVariables: {},
            stepVariables: { extraArgs: ['--max-turns', '4'] },
        })).toEqual(['--max-turns', '4']);
    });

    it('replaces the lump list with the step list', () => {
        expect(resolvePresetExtraArgs({
            lumpVariables: { extraArgs: ['--lump'] },
            stepVariables: { extraArgs: ['--step', 'b'] },
        })).toEqual(['--step', 'b']);
    });

    it('clears the lump list when the step sets extraArgs to []', () => {
        expect(resolvePresetExtraArgs({
            lumpVariables: { extraArgs: ['--lump'] },
            stepVariables: { extraArgs: [] },
        })).toEqual([]);
    });

    it('returns [] when neither bag sets extraArgs', () => {
        expect(resolvePresetExtraArgs({})).toEqual([]);
        expect(resolvePresetExtraArgs({
            lumpVariables: {},
            stepVariables: {},
        })).toEqual([]);
    });

    it('throws when extraArgs is not an array of strings', () => {
        expect(() => resolvePresetExtraArgs({
            lumpVariables: { extraArgs: '--flag' },
        })).toThrow('extraArgs must be an array of strings');
        expect(() => resolvePresetExtraArgs({
            lumpVariables: { extraArgs: ['--flag', 1] },
        })).toThrow('extraArgs must be an array of strings');
        expect(() => resolvePresetExtraArgs({
            stepVariables: { extraArgs: null },
        })).toThrow('extraArgs must be an array of strings');
    });
});
