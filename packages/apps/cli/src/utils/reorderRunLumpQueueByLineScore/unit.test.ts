import { describe, expect, it } from 'vitest';

import { reorderRunLumpQueueByLineScore, type ScoredLumpLine } from './main';

function scored(
    lumpName: string,
    branch: string,
    lineScore: ScoredLumpLine['lineScore'],
): ScoredLumpLine {
    return { lumpName, effectiveDiscoveryBranch: branch, lineScore };
}

describe('reorderRunLumpQueueByLineScore', () => {
    it('slot-stable: better priority of same lump swaps into earlier slot; other lump stays', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'dev', { kind: 'scored', value: 10 }),
            scored('other', 'dev', { kind: 'scored', value: 1 }),
            scored('backlog', 'feature', { kind: 'scored', value: 3 }),
        ];
        expect(reorderRunLumpQueueByLineScore(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature' },
            { lumpName: 'other', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' },
        ]);
    });

    it('ties keep collect/scan order', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'dev', { kind: 'scored', value: 5 }),
            scored('backlog', 'feature/a', { kind: 'scored', value: 5 }),
            scored('backlog', 'feature/b', { kind: 'scored', value: 5 }),
        ];
        expect(reorderRunLumpQueueByLineScore(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/a' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/b' },
        ]);
    });

    it('empty lines sort after scored lines of the same lump', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'dev', { kind: 'empty' }),
            scored('backlog', 'feature', { kind: 'scored', value: 3 }),
            scored('backlog', 'release', { kind: 'empty' }),
        ];
        expect(reorderRunLumpQueueByLineScore(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'release' },
        ]);
    });

    it('failed lines stay frozen in their collect slots', () => {
        const items: ScoredLumpLine[] = [
            scored('backlog', 'dev', { kind: 'scored', value: 10 }),
            scored('backlog', 'mid', { kind: 'failed', reason: 'boom' }),
            scored('backlog', 'feature', { kind: 'scored', value: 3 }),
        ];
        expect(reorderRunLumpQueueByLineScore(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'mid' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' },
        ]);
    });

    it('mixed lumpNames only reorder within each lumpName', () => {
        const items: ScoredLumpLine[] = [
            scored('a', 'dev', { kind: 'scored', value: 9 }),
            scored('b', 'dev', { kind: 'scored', value: 1 }),
            scored('a', 'feature', { kind: 'scored', value: 2 }),
            scored('b', 'feature', { kind: 'scored', value: 8 }),
        ];
        expect(reorderRunLumpQueueByLineScore(items)).toEqual([
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
        expect(reorderRunLumpQueueByLineScore(items)).toEqual([
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
        expect(reorderRunLumpQueueByLineScore(items)).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'other', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature' },
        ]);
    });

    it('returns empty array for empty input', () => {
        expect(reorderRunLumpQueueByLineScore([])).toEqual([]);
    });
});
