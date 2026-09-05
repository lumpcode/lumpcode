import { describe, expect, it } from 'vitest';

import { reorderDedicatedLumpLines, type ScoredLumpLine } from './main';

type FutureLineScore =
    | { kind: 'scored'; values: number[] }
    | { kind: 'empty' }
    | { kind: 'failed'; reason: string };

function scored(lumpName: string, branch: string, lineScore: FutureLineScore): ScoredLumpLine {
    return { lumpName, effectiveDiscoveryBranch: branch, lineScore } as unknown as ScoredLumpLine;
}

describe('reorderDedicatedLumpLines', () => {
    it('slot-stable: better one-batch score of same lump swaps; other lump stays', () => {
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

    it('ties keep collect/scan order', () => {
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

    it('empty lines sort after scored lines of the same lump', () => {
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

    it('failed lines stay frozen in their collect slots', () => {
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

    it('mixed lumpNames only reorder within each lumpName', () => {
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

    it('identity when all empty', () => {
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

    it('identity when all failed', () => {
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

    it('returns empty array for empty input', () => {
        expect(reorderDedicatedLumpLines([])).toEqual([]);
    });

    describe('batch stream fill (dedicated-tick-line-batch-order)', () => {
        it('stronger line can occupy more than one row: [B, B]', () => {
            const items = [
                scored('L', 'A', { kind: 'scored', values: [10, 12] }),
                scored('L', 'B', { kind: 'scored', values: [1, 3] }),
            ];
            expect(reorderDedicatedLumpLines(items)).toEqual([
                { lumpName: 'L', effectiveDiscoveryBranch: 'B' },
                { lumpName: 'L', effectiveDiscoveryBranch: 'B' },
            ]);
        });

        it('packed batches keep first-batch order: [A, B]', () => {
            const items = [
                scored('L', 'A', { kind: 'scored', values: [1, 5] }),
                scored('L', 'B', { kind: 'scored', values: [3, 7] }),
            ];
            expect(reorderDedicatedLumpLines(items)).toEqual([
                { lumpName: 'L', effectiveDiscoveryBranch: 'A' },
                { lumpName: 'L', effectiveDiscoveryBranch: 'B' },
            ]);
        });

        it('leftover rows fill from later batches: [B, A, A] drops unused C', () => {
            const items = [
                scored('L', 'B', { kind: 'scored', values: [1] }),
                scored('L', 'A', { kind: 'scored', values: [10, 12] }),
                scored('L', 'C', { kind: 'empty' }),
            ];
            const result = reorderDedicatedLumpLines(items);
            expect(result).toHaveLength(3);
            expect(result).toEqual([
                { lumpName: 'L', effectiveDiscoveryBranch: 'B' },
                { lumpName: 'L', effectiveDiscoveryBranch: 'A' },
                { lumpName: 'L', effectiveDiscoveryBranch: 'A' },
            ]);
        });

        it('unused leftover rows are unused lines, scored before empty: [B, A, C]', () => {
            const items = [
                scored('L', 'B', { kind: 'scored', values: [1] }),
                scored('L', 'A', { kind: 'empty' }),
                scored('L', 'C', { kind: 'empty' }),
            ];
            expect(reorderDedicatedLumpLines(items)).toEqual([
                { lumpName: 'L', effectiveDiscoveryBranch: 'B' },
                { lumpName: 'L', effectiveDiscoveryBranch: 'A' },
                { lumpName: 'L', effectiveDiscoveryBranch: 'C' },
            ]);
        });

        it('equal first-batch scores break ties by collect index then batch index', () => {
            const items = [
                scored('L', 'A', { kind: 'scored', values: [5, 6] }),
                scored('L', 'B', { kind: 'scored', values: [5, 8] }),
            ];
            expect(reorderDedicatedLumpLines(items)).toEqual([
                { lumpName: 'L', effectiveDiscoveryBranch: 'A' },
                { lumpName: 'L', effectiveDiscoveryBranch: 'B' },
            ]);
        });

        it('failed row stays frozen; remaining rows fill from the batch stream', () => {
            const items = [
                scored('L', 'A', { kind: 'scored', values: [10, 12] }),
                scored('L', 'F', { kind: 'failed', reason: 'boom' }),
                scored('L', 'B', { kind: 'scored', values: [1, 3] }),
            ];
            expect(reorderDedicatedLumpLines(items)).toEqual([
                { lumpName: 'L', effectiveDiscoveryBranch: 'B' },
                { lumpName: 'L', effectiveDiscoveryBranch: 'F' },
                { lumpName: 'L', effectiveDiscoveryBranch: 'B' },
            ]);
        });

        it('other lump keeps its index while this lump repeats across it', () => {
            const items = [
                scored('backlog', 'dev', { kind: 'scored', values: [10] }),
                scored('other', 'dev', { kind: 'scored', values: [1] }),
                scored('backlog', 'feature', { kind: 'scored', values: [1, 3] }),
            ];
            expect(reorderDedicatedLumpLines(items)).toEqual([
                { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature' },
                { lumpName: 'other', effectiveDiscoveryBranch: 'dev' },
                { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature' },
            ]);
        });
    });
});
