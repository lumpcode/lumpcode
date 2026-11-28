import fs from 'node:fs/promises';
import path from 'node:path';

import { getContextStatus } from '@lumpcode/cli-utils';
import { pathExists } from '@lumpcode/core';
import { load as loadYaml } from 'js-yaml';

import { listUmbrellaTicketNames, type BacklogPaths } from '../../kit';
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
import { parseFeatureStages, parseFeatureWorkflow, resolveTerminal } from './workflow';

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

async function resolveItemWorkflow(input: {
    item: FeatureBacklogItem;
    paths: BacklogPaths;
    projectRoot: string;
    /** Workflow recipe reads `stages` (and the deprecated `workflow` alias). */
    stagesField: boolean;
}): Promise<FeatureBacklogWorkflow> {
    const { item, paths, projectRoot, stagesField } = input;
    if (item.workflow !== undefined) {
        return item.workflow;
    }
    if (item.parentName === undefined) {
        return DEFAULT_FEATURE_BACKLOG_WORKFLOW;
    }

    const parentDescPath = path.join(
        projectRoot,
        paths.backlogItemsDir,
        'todo',
        item.parentName,
        'desc.yml',
    );
    let rawText: string;
    try {
        rawText = await fs.readFile(parentDescPath, 'utf-8');
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
            return DEFAULT_FEATURE_BACKLOG_WORKFLOW;
        }
        throw error;
    }

    const parsed = stagesField
        ? parseFeatureStages(item.parentName, loadYaml(rawText))
        : parseFeatureWorkflow(item.parentName, loadYaml(rawText));
    return parsed ?? DEFAULT_FEATURE_BACKLOG_WORKFLOW;
}

function artifactVariables(input: {
    stage: FeatureBacklogStage;
    workflow: FeatureBacklogWorkflow;
    reqFilePath: string;
    testPlanFilePath: string;
    hasReq: boolean;
    hasTestPlan: boolean;
    stagesField: boolean;
}): Record<string, string> {
    const joined = input.workflow.join(',');
    const variables: Record<string, string> = {
        WORKFLOW: joined,
    };
    if (input.stagesField) {
        variables.STAGES = joined;
    }
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
    /** When true, read `stages` from parent desc.yml and set the `STAGES` variable. */
    stagesField?: boolean;
}): Promise<BacklogItemResolution<FeatureBacklogStage>> {
    const {
        item,
        paths,
        projectRoot,
        discoveryBranch,
        primaryDiscoveryBranch,
        itemDiscoveryBranchPrefix,
        stagesField = false,
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
            return {
                stage: 'completion',
                contextName: item.name,
                additionalDependsOnContexts: ticketNames.map(
                    (ticketName) => `${item.name}-${ticketName}`,
                ),
            };
        }
    }

    const contextBaseName = featureItemContextBaseName(item);
    const workflow = await resolveItemWorkflow({ item, paths, projectRoot, stagesField });

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

    const resolveStage = (stage: FeatureBacklogStage): BacklogItemResolution<FeatureBacklogStage> => ({
        stage,
        contextName: featureContextName(contextBaseName, stage),
        variables: artifactVariables({
            stage,
            workflow,
            reqFilePath,
            testPlanFilePath,
            hasReq,
            hasTestPlan,
            stagesField,
        }),
    });

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
