import { describe, expect, it, vi } from 'vitest';

import { resolveOutputDetail } from './resolveOutputDetail';

describe('resolveOutputDetail', () => {
    it('defaults to loud when both bags omit the key', () => {
        expect(resolveOutputDetail({})).toBe('loud');
        expect(resolveOutputDetail({ lumpVariables: {}, stepVariables: {} })).toBe('loud');
    });

    it('uses the lump value when the step omits the key', () => {
        expect(resolveOutputDetail({
            lumpVariables: { outputDetail: 'quiet' },
        })).toBe('quiet');
        expect(resolveOutputDetail({
            lumpVariables: { outputDetail: 'loud' },
            stepVariables: {},
        })).toBe('loud');
    });

    it('lets the step override the lump', () => {
        expect(resolveOutputDetail({
            lumpVariables: { outputDetail: 'quiet' },
            stepVariables: { outputDetail: 'loud' },
        })).toBe('loud');
        expect(resolveOutputDetail({
            lumpVariables: { outputDetail: 'loud' },
            stepVariables: { outputDetail: 'quiet' },
        })).toBe('quiet');
    });

    it('warns and defaults to loud for invalid values', () => {
        const warn = vi.fn();
        expect(resolveOutputDetail({
            lumpVariables: { outputDetail: 'verbose' },
            logger: { warn },
        })).toBe('loud');
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/outputDetail[\s\S]*verbose/));

        warn.mockClear();
        expect(resolveOutputDetail({
            lumpVariables: { outputDetail: 'quiet' },
            stepVariables: { outputDetail: 1 },
            logger: { warn },
        })).toBe('loud');
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/outputDetail[\s\S]*1/));
    });

    it('defaults to loud without warning when no logger is passed', () => {
        expect(resolveOutputDetail({
            lumpVariables: { outputDetail: 'verbose' },
        })).toBe('loud');
    });
});
