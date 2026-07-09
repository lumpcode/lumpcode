import type { Step } from '@lumpcode/core';

import {
    FINDER_BACKLOG_BASELINE_KEY,
    readFinderBacklogBaseline,
} from './validateFinderOutput';

export type RecordFinderBacklogBaselineOptions = {
    implementerLumpName: string;
};

/** Records implementer backlog size before the finder agent adds a new item. */
export function recordFinderBacklogBaselineStep({
    implementerLumpName,
}: RecordFinderBacklogBaselineOptions): Step {
    return {
        async commandFn({ contextRunState, workspacePath }) {
            const baseline = await readFinderBacklogBaseline({
                workspacePath,
                implementerLumpName,
            });
            contextRunState[FINDER_BACKLOG_BASELINE_KEY] = baseline;

            return {
                executable: 'echo',
                args: [`Recorded backlog baseline (${baseline.count} pending items).`],
            };
        },
    };
}
