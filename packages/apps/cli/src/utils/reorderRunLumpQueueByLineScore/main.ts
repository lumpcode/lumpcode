import type { LineScore, ScoredLumpLine } from '../scoreDedicatedLumpLine';
import type { LumpLine } from '../runLumpQueueWithConcurrency';

export type { ScoredLumpLine };

function stripScore(item: ScoredLumpLine): LumpLine {
    return {
        lumpName: item.lumpName,
        effectiveDiscoveryBranch: item.effectiveDiscoveryBranch,
    };
}

type ScoredPriorityItem = ScoredLumpLine & {
    lineScore: Extract<LineScore, { kind: 'scored' }>;
};

/**
 * Slot-stable reorder: for each `lumpName`, fill that lump's non-failed slots
 * with its scored lines (best priority first), then empty lines (collect order).
 * Failed lines stay frozen in their collect indices. Other lumps' slots are untouched.
 *
 * @example
 * // input (collect / scan order)
 * //   backlog@dev        scored 10
 * //   other@dev          scored 1
 * //   backlog@feature    scored 3
 * // output
 * //   backlog@feature    (3 beats 10; takes backlog's first slot)
 * //   other@dev          (same index)
 * //   backlog@dev
 */
export function reorderRunLumpQueueByLineScore(
    items: readonly ScoredLumpLine[],
): LumpLine[] {
    if (items.length === 0) {
        return [];
    }

    const result = items.map(stripScore);
    const indicesByLump = new Map<string, number[]>();

    for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const list = indicesByLump.get(item.lumpName);
        if (list) {
            list.push(i);
        } else {
            indicesByLump.set(item.lumpName, [i]);
        }
    }

    for (const indices of indicesByLump.values()) {
        const scored: ScoredPriorityItem[] = [];
        const empty: ScoredLumpLine[] = [];
        const movableSlots: number[] = [];

        for (const i of indices) {
            const item = items[i]!;
            switch (item.lineScore.kind) {
                case 'failed':
                    break;
                case 'scored':
                    movableSlots.push(i);
                    scored.push({ ...item, lineScore: item.lineScore });
                    break;
                case 'empty':
                    movableSlots.push(i);
                    empty.push(item);
                    break;
                default: {
                    const _exhaustive: never = item.lineScore;
                    throw new Error(`unhandled line score: ${JSON.stringify(_exhaustive)}`);
                }
            }
        }

        scored.sort((a, b) => a.lineScore.value - b.lineScore.value);
        const fillers = [...scored, ...empty];
        for (let f = 0; f < movableSlots.length; f++) {
            result[movableSlots[f]!] = stripScore(fillers[f]!);
        }
    }

    return result;
}
