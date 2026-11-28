import fs from 'node:fs';
import path from 'node:path';

import { load as loadYaml } from 'js-yaml';

import { validateBaseBacklogItem } from '../../kit';
import type { BaseBacklogItem } from '../../types';
import type { FeatureBacklogItem } from './types';
import {
    assertValidFeatureItemName,
    parentNameFromTodoRelativeDir,
    parseFeatureStages,
    parseFeatureWorkflow,
    parseManual,
} from './workflow';

function mergeUniqueDependsOn(...lists: (string[] | undefined)[]): string[] | undefined {
    const merged = [...new Set(lists.flatMap((list) => list ?? []))];
    return merged.length > 0 ? merged : undefined;
}

function parentDependsOnFromDesc(input: {
    projectRoot: string;
    backlogItemsDir: string;
    parentName: string;
}): string[] {
    const descPath = path.join(
        input.projectRoot,
        input.backlogItemsDir,
        'todo',
        input.parentName,
        'desc.yml',
    );
    let rawText: string;
    try {
        rawText = fs.readFileSync(descPath, 'utf-8');
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
    const raw = loadYaml(rawText);
    const baseItem = validateBaseBacklogItem(raw, `in folder "${input.parentName}"`);
    if (baseItem.name !== input.parentName) {
        throw new Error(
            `Backlog item folder "${input.parentName}" desc.yml name "${baseItem.name}" must match folder name`,
        );
    }
    return baseItem.dependsOn ?? [];
}

function ticketDependsOn(input: {
    projectRoot: string;
    backlogItemsDir: string;
    parentName: string;
    ownDependsOn: string[] | undefined;
}): string[] | undefined {
    const siblingContexts = input.ownDependsOn?.map((dep) => `${input.parentName}-${dep}`);
    return mergeUniqueDependsOn(
        parentDependsOnFromDesc(input),
        siblingContexts,
    );
}

/** Shared desc.yml parse for the steps recipe (`workflow`) and the workflow recipe (`stages`). */
export function parseFeatureBacklogFolderItem(input: {
    baseItem: BaseBacklogItem;
    folderName: string;
    raw: unknown;
    projectRoot: string;
    backlogItemsDir: string;
    field: 'stages' | 'workflow';
}): FeatureBacklogItem {
    const { baseItem, folderName, raw, projectRoot, backlogItemsDir, field } = input;
    assertValidFeatureItemName(baseItem.name);
    const record = raw as Record<string, unknown>;
    const parentName = parentNameFromTodoRelativeDir(folderName);
    return {
        ...baseItem,
        todoRelativeDir: folderName,
        parentName,
        dependsOn: parentName
            ? ticketDependsOn({
                  projectRoot,
                  backlogItemsDir,
                  parentName,
                  ownDependsOn: baseItem.dependsOn,
              })
            : baseItem.dependsOn,
        manual: parseManual(baseItem.name, record),
        workflow: field === 'stages'
            ? parseFeatureStages(baseItem.name, raw)
            : parseFeatureWorkflow(baseItem.name, raw),
    };
}
