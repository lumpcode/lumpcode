import fs from 'fs/promises';
import path from 'path';
import { load as loadYaml } from 'js-yaml';
import type { Context, GetContextListFn } from '@lumpcode/cli-types';

import { backlogPaths } from './backlogPaths';
import { getNextFlow } from './getNextFlow';
import { iterateBacklogItems } from './iterateBacklogItems';
import type {
    AbstractionBacklogItem,
    BacklogItem,
    BacklogItemMode,
    BacklogPhaseMode,
    FeatureFlow,
} from './types';

export type LoadBacklogContextsOptions = {
    lumpName: string;
    baseBranch: string;
    /** Git project root for remote context status; defaults to `process.cwd()`. */
    projectRoot?: string;
    phaseMode: BacklogPhaseMode;
    itemMode: BacklogItemMode;
};

export type MakeBacklogContextListFnOptions = Omit<LoadBacklogContextsOptions, 'phaseMode' | 'itemMode'> & {
    phaseMode?: BacklogPhaseMode;
    itemMode?: BacklogItemMode;
};

function featureContextName(itemName: string, nextFlow: FeatureFlow): string {
    return nextFlow === 'impl' ? itemName : `${itemName}_${nextFlow}`;
}

export async function loadBacklogContexts({
    lumpName,
    baseBranch,
    projectRoot = process.cwd(),
    phaseMode,
    itemMode,
}: LoadBacklogContextsOptions) {
    const { backlogPath, donePath, prdDir, testPlanDir } = backlogPaths(lumpName);
    const raw = await fs.readFile(backlogPath, 'utf-8');
    const doc = loadYaml(raw) as BacklogItem[] | AbstractionBacklogItem[];

    const contexts: Context[] = [];

    for (const item of iterateBacklogItems(doc)) {
        const dependsOnContexts = item.dependsOn ?? [];

        if (itemMode === 'abstraction') {
            const prdFilePath = path.join(prdDir, `${item.name}.prd.md`);
            const nextFlow = await getNextFlow({
                item,
                lumpName,
                baseBranch,
                projectRoot,
                phaseMode: 'prd-impl-only',
            });

            if (!nextFlow) continue;

            contexts.push({
                name: item.name,
                variables: {
                    TASK_NAME: item.name,
                    TASK: item.task,
                    BACKLOG_FILE: backlogPath,
                    DONE_FILE: donePath,
                    NEXT_FLOW: nextFlow,
                    PRD_FILE: prdFilePath,
                },
                options: {
                    priority: item.priority,
                    dependsOnContexts,
                },
            });
            continue;
        }

        const typedItem = item as BacklogItem;
        const itemType = typedItem.type;

        const contextToPush = {
            name: typedItem.name,
            variables: {
                TYPE: itemType,
                TASK_NAME: typedItem.name,
                TASK: typedItem.task,
                BACKLOG_FILE: backlogPath,
                DONE_FILE: donePath,
            },
            options: {
                priority: typedItem.priority,
                dependsOnContexts,
            },
        };

        if (itemType === 'feature') {
            const prdFilePath = path.join(prdDir, `${typedItem.name}.prd.md`);
            const testPlanFilePath = path.join(testPlanDir, `${typedItem.name}.test.md`);
            const nextFlow = await getNextFlow({
                item: typedItem,
                lumpName,
                baseBranch,
                projectRoot,
                phaseMode,
            });

            if (!nextFlow) continue;

            contexts.push({
                ...contextToPush,
                name: featureContextName(typedItem.name, nextFlow),
                variables: {
                    ...contextToPush.variables,
                    NEXT_FLOW: nextFlow,
                    PRD_FILE: prdFilePath,
                    TEST_PLAN_FILE: testPlanFilePath,
                },
            });
        } else if (itemType === 'documentation' || itemType === 'misc') {
            contexts.push(contextToPush);
        }
    }

    return contexts;
}

export async function loadPendingBacklogContexts(
    options: MakeBacklogContextListFnOptions,
): Promise<Context[]> {
    return loadBacklogContexts({
        ...options,
        phaseMode: options.phaseMode ?? 'full',
        itemMode: options.itemMode ?? 'typed',
    });
}

export async function loadAbstractionBacklogContexts(
    options: MakeBacklogContextListFnOptions,
): Promise<Context[]> {
    return loadBacklogContexts({
        ...options,
        phaseMode: 'prd-impl-only',
        itemMode: 'abstraction',
    });
}

export function makeBacklogContextListFn(options: MakeBacklogContextListFnOptions): GetContextListFn {
    return () =>
        loadBacklogContexts({
            ...options,
            phaseMode: options.phaseMode ?? 'full',
            itemMode: options.itemMode ?? 'typed',
        });
}

export function makeAbstractionBacklogContextListFn(
    options: MakeBacklogContextListFnOptions,
): GetContextListFn {
    return () =>
        loadBacklogContexts({
            ...options,
            phaseMode: 'prd-impl-only',
            itemMode: 'abstraction',
        });
}
