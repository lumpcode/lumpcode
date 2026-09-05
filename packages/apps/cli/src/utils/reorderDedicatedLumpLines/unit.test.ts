import { describe, expect, it } from 'vitest';

import { reorderDedicatedLumpLines, type ScoredLumpLine } from './main';

function scored(
    lumpName: string,
    branch: string,
    lineScore:
        | { kind: 'scored'; values: number[] }
        | { kind: 'empty' }
        | { kind: 'failed'; reason: string },
): ScoredLumpLine {
    return {
        lumpName,
        effectiveDiscoveryBranch: branch,
        lineScore: lineScore as ScoredLumpLine['lineScore'],
    };
}

describe('reorderDedicatedLumpLines', () => {
    it.skip('R1: repeat stronger line occupies both collect rows (story 1)', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'feature/b', { kind: 'scored', values: [1, 3] }),
            scored('backlog', 'feature/a', { kind: 'scored', values: [10, 12] }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/b' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/b' },
        ]);
    });

    it.skip('R2: packed batches keep one row per line when first batches win (story 2)', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'feature/a', { kind: 'scored', values: [1, 5] }),
            scored('backlog', 'feature/b', { kind: 'scored', values: [3, 7] }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/a' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/b' },
        ]);
    });

    it.skip('R3: leftover slot is consumed by a repeat; unused empty is dropped (story 3)', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'feature/b', { kind: 'scored', values: [1] }),
            scored('backlog', 'feature/a', { kind: 'scored', values: [10, 12] }),
            scored('backlog', 'feature/c', { kind: 'empty' }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/b' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/a' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/a' },
        ]);
    });

    it.skip('R4: leftover empties keep collect order (story 4)', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'feature/b', { kind: 'scored', values: [1] }),
            scored('backlog', 'feature/a', { kind: 'empty' }),
            scored('backlog', 'feature/c', { kind: 'empty' }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/b' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/a' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/c' },
        ]);
    });

    it.skip('R5: tie uses collect index (story 5)', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'feature/a', { kind: 'scored', values: [5, 6] }),
            scored('backlog', 'feature/b', { kind: 'scored', values: [5, 8] }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/a' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/b' },
        ]);
    });

    it.skip('R6: other lump stays in its collect index (story 6)', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'dev', { kind: 'scored', values: [10] }),
            scored('other', 'dev', { kind: 'scored', values: [1] }),
            scored('backlog', 'feature', { kind: 'scored', values: [3] }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature' },
            { lumpName: 'other', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' },
        ]);
    });

    it.skip('R7: failed index stays frozen; remaining slots fill from the stream', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'feature/a', { kind: 'scored', values: [10, 12] }),
            scored('backlog', 'mid', { kind: 'failed', reason: 'boom' }),
            scored('backlog', 'feature/b', { kind: 'scored', values: [1, 3] }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/b' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'mid' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/b' },
        ]);
    });

    it.skip('R8: existing scalar swap with one-batch values', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'dev', { kind: 'scored', values: [10] }),
            scored('other', 'dev', { kind: 'scored', values: [1] }),
            scored('backlog', 'feature', { kind: 'scored', values: [3] }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature' },
            { lumpName: 'other', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' },
        ]);
    });

    it.skip('R9: ties keep collect/scan order', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'dev', { kind: 'scored', values: [5] }),
            scored('backlog', 'feature/a', { kind: 'scored', values: [5] }),
            scored('backlog', 'feature/b', { kind: 'scored', values: [5] }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/a' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/b' },
        ]);
    });

    it.skip('R9: empty lines sort after scored lines of the same lump', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'dev', { kind: 'empty' }),
            scored('backlog', 'feature', { kind: 'scored', values: [3] }),
            scored('backlog', 'release', { kind: 'empty' }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'release' },
        ]);
    });

    it.skip('R9: failed lines stay frozen in their collect slots', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'dev', { kind: 'scored', values: [10] }),
            scored('backlog', 'mid', { kind: 'failed', reason: 'boom' }),
            scored('backlog', 'feature', { kind: 'scored', values: [3] }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'mid' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' },
        ]);
    });

    it.skip('R9: mixed lumpNames only reorder within each lumpName', () => {
        const items: ScoredLumpLine[] = [
            scored('a', 'dev', { kind: 'scored', values: [9] }),
            scored('b', 'dev', { kind: 'scored', values: [1] }),
            scored('a', 'feature', { kind: 'scored', values: [2] }),
            scored('b', 'feature', { kind: 'scored', values: [8] }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'a', effectiveDiscoveryBranch: 'feature' },
            { lumpName: 'b', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'a', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'b', effectiveDiscoveryBranch: 'feature' },
        ]);
    });

    it('R9: identity when all empty', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'dev', { kind: 'empty' }),
            scored('other', 'dev', { kind: 'empty' }),
            scored('backlog', 'feature', { kind: 'empty' }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'other', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature' },
        ]);
    });

    it('R9: identity when all failed', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'dev', { kind: 'failed', reason: 'a' }),
            scored('other', 'dev', { kind: 'failed', reason: 'b' }),
            scored('backlog', 'feature', { kind: 'failed', reason: 'c' }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'other', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature' },
        ]);
    });

    it('R9: returns empty array for empty input', () => {
        expect(reorderDedicatedLumpLines([])).toEqual([]);
    });

    it.skip('R10: one row with many batches stays identity', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'feature/a', { kind: 'scored', values: [1, 5, 9] }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/a' },
        ]);
    });

    it.skip('R11: repeat then leftover empty fills unused empties in collect order', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'feature/b', { kind: 'scored', values: [1, 2] }),
            scored('backlog', 'feature/a', { kind: 'empty' }),
            scored('backlog', 'feature/c', { kind: 'empty' }),
        ];
        expect(reorderDedicatedLumpLines(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/b' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/b' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/a' },
        ]);
    });
});
