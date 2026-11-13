import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
import path from 'node:path';

import { getContextStatus } from '@lumpcode/cli-utils';
import { pathExists } from '@lumpcode/core';
import { load as loadYaml } from 'js-yaml';

import {
    listUmbrellaTicketNames,
    validateBaseBacklogItem,
    type BacklogPaths,
} from '../../kit';
import type { BacklogItemResolution } from '../backlog';
import {
    classifyDiscoveryScan,
    itemIsEligibleForDiscoveryScan,
    itemNameFromCampaignBranch,
} from './discovery';
import {
    DEFAULT_FEATURE_BACKLOG_WORKFLOW,
    type FeatureBacklogItem,
    type FeatureBacklogStage,
    type FeatureBacklogWorkflow,
    type FeatureBacklogWorkflowStage,
} from './types';
import { parseFeatureWorkflow, resolveTerminal } from './workflow';

function featureItemContextBaseName(item: Pick<FeatureBacklogItem, 'name' | 'parentName'>): string {
    return item.parentName ? `${item.parentName}-${item.name}` : item.name;
}

function featureContextName(itemName: string, stage: FeatureBacklogStage): string {
    switch (stage) {
        case 'req':
            return `${itemName}_req`;
        case 'testPlan':
            return `${itemName}_testPlan`;
        case 'testImpl':
            return `${itemName}_testImpl`;
        case 'impl':
        case 'directImpl':
        case 'completion':
            return itemName;
        default: {
            const _exhaustive: never = stage;
            return _exhaustive;
        }
    }
}

type ParentBacklogDesc = {
    dependsOn: string[];
    workflow: FeatureBacklogWorkflow | undefined;
};

type ParentBacklogDescCache = Map<string, Promise<ParentBacklogDesc | undefined>>;

const parentDescCacheStore = new AsyncLocalStorage<ParentBacklogDescCache>();

/** One parent `desc.yml` read per context-list build, shared by every ticket under that parent. */
export function runWithParentDescCache<T>(fn: () => T): T {
    return parentDescCacheStore.run(new Map(), fn);
}

function inheritedDependsOnContexts(
    inherited: readonly string[],
    own: readonly string[] | undefined,
): string[] | undefined {
    const seen = new Set(own ?? []);
    const extra: string[] = [];
    for (const dep of inherited) {
        if (seen.has(dep)) {
            continue;
        }
        seen.add(dep);
        extra.push(dep);
    }
    return extra.length > 0 ? extra : undefined;
}

async function readParentBacklogDesc(input: {
    parentName: string;
    paths: BacklogPaths;
    projectRoot: string;
}): Promise<ParentBacklogDesc | undefined> {
    const { parentName, paths, projectRoot } = input;
    const descPath = path.join(
        projectRoot,
        paths.backlogItemsDir,
        'todo',
        parentName,
        'desc.yml',
    );
    let rawText: string;
    try {
        rawText = await fs.readFile(descPath, 'utf-8');
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }

    const raw = loadYaml(rawText);
    const baseItem = validateBaseBacklogItem(raw, `in folder "${parentName}"`);
    if (baseItem.name !== parentName) {
        throw new Error(
            `Backlog item folder "${parentName}" desc.yml name "${baseItem.name}" must match folder name`,
        );
    }
    return {
        dependsOn: baseItem.dependsOn ?? [],
        workflow: parseFeatureWorkflow(parentName, raw),
    };
}

function loadParentBacklogDesc(input: {
    parentName: string;
    paths: BacklogPaths;
    projectRoot: string;
    cache: ParentBacklogDescCache;
}): Promise<ParentBacklogDesc | undefined> {
    const existing = input.cache.get(input.parentName);
    if (existing) {
        return existing;
    }
    const pending = readParentBacklogDesc(input);
    input.cache.set(input.parentName, pending);
    return pending;
}

async function resolveItemWorkflow(input: {
    item: FeatureBacklogItem;
    paths: BacklogPaths;
    projectRoot: string;
    parentDescCache: ParentBacklogDescCache;
}): Promise<FeatureBacklogWorkflow> {
    const { item, paths, projectRoot, parentDescCache } = input;
    if (item.workflow !== undefined) {
        return item.workflow;
    }
    if (item.parentName === undefined) {
        return DEFAULT_FEATURE_BACKLOG_WORKFLOW;
    }

    const parent = await loadParentBacklogDesc({
        parentName: item.parentName,
        paths,
        projectRoot,
        cache: parentDescCache,
    });
    return parent?.workflow ?? DEFAULT_FEATURE_BACKLOG_WORKFLOW;
}

function artifactVariables(input: {
    stage: FeatureBacklogStage;
    workflow: FeatureBacklogWorkflow;
    reqFilePath: string;
    testPlanFilePath: string;
    hasReq: boolean;
    hasTestPlan: boolean;
}): Record<string, string> {
    const variables: Record<string, string> = {
        WORKFLOW: input.workflow.join(','),
    };
    if (input.hasReq || input.stage === 'req') {
        variables.REQ_FILE = input.reqFilePath;
    }
    if (input.hasTestPlan || input.stage === 'testPlan') {
        variables.TEST_PLAN_FILE = input.testPlanFilePath;
    }
    return variables;
}

export async function resolveFeatureBacklogItem(input: {
    item: FeatureBacklogItem;
    paths: BacklogPaths;
    projectRoot: string;
    discoveryBranch: string;
    primaryDiscoveryBranch: string;
    itemDiscoveryBranchPrefix: string;
}): Promise<BacklogItemResolution<FeatureBacklogStage>> {
    const {
        item,
        paths,
        projectRoot,
        discoveryBranch,
        primaryDiscoveryBranch,
        itemDiscoveryBranchPrefix,
    } = input;

    if (item.parentName === undefined) {
        const todoDir = path.join(projectRoot, paths.backlogItemsDir, 'todo');
        const ticketNames = await listUmbrellaTicketNames({
            todoDir,
            parentName: item.name,
        });
        if (ticketNames.length > 0) {
            if (item.completedAt) {
                return { ignored: true };
            }
            if (
                classifyDiscoveryScan(
                    discoveryBranch,
                    primaryDiscoveryBranch,
                    itemDiscoveryBranchPrefix,
                ) !== 'itemCampaign' ||
                itemNameFromCampaignBranch(discoveryBranch, itemDiscoveryBranchPrefix) !== item.name
            ) {
                return { ignored: true };
            }
            const additionalDependsOnContexts = inheritedDependsOnContexts(
                ticketNames.map((ticketName) => `${item.name}-${ticketName}`),
                item.dependsOn,
            );
            return {
                stage: 'completion',
                contextName: item.name,
                ...(additionalDependsOnContexts ? { additionalDependsOnContexts } : {}),
            };
        }
    }

    const contextBaseName = featureItemContextBaseName(item);
    const parentDescCache = parentDescCacheStore.getStore() ?? new Map();
    const workflow = await resolveItemWorkflow({
        item,
        paths,
        projectRoot,
        parentDescCache,
    });

    if (
        item.manual === true ||
        !!item.completedAt ||
        !itemIsEligibleForDiscoveryScan({
            itemName: item.name,
            parentName: item.parentName,
            discoveryBranch,
            workflow,
            primaryDiscoveryBranch,
            itemDiscoveryBranchPrefix,
        })
    ) {
        return { ignored: true };
    }

    const itemDir = path.join(paths.backlogItemsDir, 'todo', item.todoRelativeDir);
    const reqFilePath = path.join(itemDir, 'requirements.md');
    const testPlanFilePath = path.join(itemDir, 'testPlan.md');
    const hasReq = await pathExists(path.join(projectRoot, reqFilePath));
    const hasTestPlan = await pathExists(path.join(projectRoot, testPlanFilePath));
    const wants = (stage: FeatureBacklogWorkflowStage) => workflow.includes(stage);
    const terminal = resolveTerminal(workflow);

    const resolveStage = async (
        stage: FeatureBacklogStage,
    ): Promise<BacklogItemResolution<FeatureBacklogStage>> => {
        const additionalDependsOnContexts =
            item.parentName === undefined
                ? undefined
                : inheritedDependsOnContexts(
                      (
                          await loadParentBacklogDesc({
                              parentName: item.parentName,
                              paths,
                              projectRoot,
                              cache: parentDescCache,
                          })
                      )?.dependsOn ?? [],
                      item.dependsOn,
                  );
        return {
            stage,
            contextName: featureContextName(contextBaseName, stage),
            variables: artifactVariables({
                stage,
                workflow,
                reqFilePath,
                testPlanFilePath,
                hasReq,
                hasTestPlan,
            }),
            ...(additionalDependsOnContexts ? { additionalDependsOnContexts } : {}),
        };
    };

    if (wants('manualReq') && !hasReq) {
        return { ignored: true };
    }

    if (wants('req') && !hasReq) {
        return resolveStage('req');
    }

    if (!hasReq && (wants('testPlan') || wants('testImpl'))) {
        return { ignored: true };
    }

    if (wants('testPlan') && !hasTestPlan) {
        return resolveStage('testPlan');
    }

    if (wants('testImpl')) {
        const testsImplContextName = featureContextName(contextBaseName, 'testImpl');
        const testsImplStatus = await getContextStatus({
            projectRoot,
            contextName: testsImplContextName,
            lumpName: paths.lumpName,
            baseBranch: discoveryBranch,
        });

        if (testsImplStatus === 'branchPushed') {
            return { ignored: true };
        }
        if (testsImplStatus !== 'finished') {
            return resolveStage('testImpl');
        }
    }

    if (terminal === 'directImpl') {
        return resolveStage('directImpl');
    }
    if (!hasReq) {
        return { ignored: true };
    }
    return resolveStage('impl');
}
