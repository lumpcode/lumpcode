import type { DedicatedLumpLine } from '../lumpLine';
import type { ScoredLumpLine } from '../scoreDedicatedLumpLine';

export type { ScoredLumpLine };

function stripScore(item: ScoredLumpLine): DedicatedLumpLine {
    return {
        lumpName: item.lumpName,
        effectiveDiscoveryBranch: item.effectiveDiscoveryBranch,
    };
}

function lineIdentity(line: DedicatedLumpLine): string {
    return `${line.lumpName}\0${line.effectiveDiscoveryBranch}`;
}

type BatchStreamEntry = {
    line: DedicatedLumpLine;
    collectIndex: number;
    batchIndex: number;
    score: number;
};

type UnusedLeftover = {
    line: DedicatedLumpLine;
    collectIndex: number;
    kind: 'scored' | 'empty';
};

/**
 * Slot-stable reorder: for each `lumpName`, fill that lump's non-failed slots
 * from the merged batch stream (score, then collect index, then batch index).
 * The same line may repeat. Unused leftover rows are lines that appear zero
 * times in the taken prefix, scored before empty, collect order inside each
 * group. Failed lines stay frozen. Other lumps' slots are untouched.
 *
 * @example
 * // input (collect / scan order)
 * //   L@A   scored [10, 12]
 * //   L@B   scored [1, 3]
 * // output
 * //   L@B
 * //   L@B
 */
export function reorderDedicatedLumpLines(
    items: readonly ScoredLumpLine[],
): DedicatedLumpLine[] {
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
        const stream: BatchStreamEntry[] = [];
        const unusedCandidates: UnusedLeftover[] = [];
        const movableSlots: number[] = [];

        for (const i of indices) {
            const item = items[i]!;
            switch (item.lineScore.kind) {
                case 'failed':
                    break;
                case 'scored': {
                    movableSlots.push(i);
                    const line = stripScore(item);
                    unusedCandidates.push({ line, collectIndex: i, kind: 'scored' });
                    for (let batchIndex = 0; batchIndex < item.lineScore.values.length; batchIndex++) {
                        stream.push({
                            line,
                            collectIndex: i,
                            batchIndex,
                            score: item.lineScore.values[batchIndex]!,
                        });
                    }
                    break;
                }
                case 'empty':
                    movableSlots.push(i);
                    unusedCandidates.push({
                        line: stripScore(item),
                        collectIndex: i,
                        kind: 'empty',
                    });
                    break;
                default: {
                    const _exhaustive: never = item.lineScore;
                    throw new Error(`unhandled line score: ${JSON.stringify(_exhaustive)}`);
                }
            }
        }

        stream.sort((a, b) => {
            if (a.score !== b.score) {
                return a.score - b.score;
            }
            if (a.collectIndex !== b.collectIndex) {
                return a.collectIndex - b.collectIndex;
            }
            return a.batchIndex - b.batchIndex;
        });

        const takenCount = Math.min(stream.length, movableSlots.length);
        const taken = stream.slice(0, takenCount);
        const fillers: DedicatedLumpLine[] = taken.map((entry) => entry.line);

        if (fillers.length < movableSlots.length) {
            const used = new Set(taken.map((entry) => lineIdentity(entry.line)));
            const unused = unusedCandidates
                .filter((candidate) => !used.has(lineIdentity(candidate.line)))
                .sort((a, b) => {
                    if (a.kind !== b.kind) {
                        return a.kind === 'scored' ? -1 : 1;
                    }
                    return a.collectIndex - b.collectIndex;
                });
            for (const candidate of unused) {
                if (fillers.length >= movableSlots.length) {
                    break;
                }
                fillers.push(candidate.line);
            }
        }

        for (let f = 0; f < movableSlots.length; f++) {
            result[movableSlots[f]!] = fillers[f]!;
        }
    }

    return result;
}
