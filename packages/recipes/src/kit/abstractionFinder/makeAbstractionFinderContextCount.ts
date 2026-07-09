import path from 'path';
import { readYamlList } from '@lumpcode/cli-utils';

import { backlogPaths, type AbstractionBacklogItem } from '../backlog';
import type { ContextCountFn } from '../ephemeralContextListFn';

export type MakeAbstractionFinderContextCountOptions = {
    implementerLumpName: string;
    maxPendingAbstractions: number;
};

/** Returns how many finder contexts to emit this tick (all open slots up to `maxPendingAbstractions`). */
export function makeAbstractionFinderContextCount({
    implementerLumpName,
    maxPendingAbstractions,
}: MakeAbstractionFinderContextCountOptions): ContextCountFn {
    return async () => {
        const { backlogPath } = backlogPaths(implementerLumpName);
        const backlogFilePath = path.join(process.cwd(), backlogPath);
        const backlog = await readYamlList<AbstractionBacklogItem>(backlogFilePath);

        return Math.max(0, maxPendingAbstractions - backlog.length);
    };
}
