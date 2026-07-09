import path from 'path';
import { readYamlList } from '@lumpcode/cli-utils';
import { pathExists } from '@lumpcode/core';

import { backlogPaths } from '../backlog';
import type { AbstractionBacklogItem } from '../backlog/types';

const VALID_CONTEXT_NAME = /^[a-zA-Z0-9_-]+$/;

export const FINDER_BACKLOG_BASELINE_KEY = 'abstractionFinderBacklogBaseline';

export type FinderBacklogBaseline = {
    count: number;
    names: string[];
};

export type ValidateAbstractionFinderOutputInput = {
    workspacePath: string;
    implementerLumpName: string;
    baseline: FinderBacklogBaseline;
};

export type ValidateAbstractionFinderOutputResult = {
    ok: boolean;
    message: string;
};

function resolveLumpPaths(workspacePath: string, implementerLumpName: string) {
    const { backlogPath, donePath, prdDir } = backlogPaths(implementerLumpName);
    return {
        backlogFilePath: path.join(workspacePath, backlogPath),
        doneFilePath: path.join(workspacePath, donePath),
        prdDirPath: path.join(workspacePath, prdDir),
    };
}

export async function readFinderBacklogBaseline({
    workspacePath,
    implementerLumpName,
}: {
    workspacePath: string;
    implementerLumpName: string;
}): Promise<FinderBacklogBaseline> {
    const { backlogFilePath } = resolveLumpPaths(workspacePath, implementerLumpName);
    const backlog = await readYamlList<AbstractionBacklogItem>(backlogFilePath);
    return {
        count: backlog.length,
        names: backlog.map((item) => item.name),
    };
}

export async function validateAbstractionFinderOutput({
    workspacePath,
    implementerLumpName,
    baseline,
}: ValidateAbstractionFinderOutputInput): Promise<ValidateAbstractionFinderOutputResult> {
    const { backlogFilePath, doneFilePath, prdDirPath } = resolveLumpPaths(
        workspacePath,
        implementerLumpName,
    );

    const backlog = await readYamlList<AbstractionBacklogItem>(backlogFilePath);
    const done = await readYamlList<AbstractionBacklogItem>(doneFilePath);
    const knownNames = new Set([
        ...baseline.names,
        ...done.map((item) => item.name),
    ]);

    if (backlog.length !== baseline.count + 1) {
        return {
            ok: false,
            message: `Expected exactly one new backlog item (before=${baseline.count}, after=${backlog.length}).`,
        };
    }

    const newItems = backlog.filter((item) => !baseline.names.includes(item.name));

    if (newItems.length !== 1) {
        return {
            ok: false,
            message: `Expected exactly one new backlog entry by name; found ${newItems.length}.`,
        };
    }

    const newItem = newItems[0];

    if (!VALID_CONTEXT_NAME.test(newItem.name)) {
        return {
            ok: false,
            message: `Invalid context name "${newItem.name}" — must match ^[a-zA-Z0-9_-]+$.`,
        };
    }

    if (knownNames.has(newItem.name)) {
        return {
            ok: false,
            message: `Backlog name "${newItem.name}" already exists in BACKLOG.yml or DONE.yml.`,
        };
    }

    if ((newItem as AbstractionBacklogItem & { type?: unknown }).type !== undefined) {
        return {
            ok: false,
            message: 'Abstraction backlog items must not include a type field.',
        };
    }

    if (!newItem.task?.trim()) {
        return {
            ok: false,
            message: 'New backlog item must include a non-empty task field.',
        };
    }

    if (typeof newItem.priority !== 'number') {
        return {
            ok: false,
            message: 'New backlog item must include a numeric priority.',
        };
    }

    const allKnownNames = new Set([
        ...backlog.map((item) => item.name),
        ...done.map((item) => item.name),
    ]);

    for (const dep of newItem.dependsOn ?? []) {
        if (!allKnownNames.has(dep)) {
            return {
                ok: false,
                message: `dependsOn entry "${dep}" must reference an item in BACKLOG.yml or DONE.yml.`,
            };
        }
        if (dep === newItem.name) {
            return {
                ok: false,
                message: 'dependsOn must not reference the new item itself.',
            };
        }
    }

    const prdFilePath = path.join(prdDirPath, `${newItem.name}.prd.md`);
    const hasPrd = await pathExists(prdFilePath);

    if (!hasPrd) {
        return {
            ok: false,
            message: `Missing PRD file at ${path.join(backlogPaths(implementerLumpName).prdDir, `${newItem.name}.prd.md`)}.`,
        };
    }

    return {
        ok: true,
        message: `Validated new abstraction "${newItem.name}".`,
    };
}
