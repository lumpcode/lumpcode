import fs from 'node:fs';
import path from 'node:path';

import type { LumpJsConfig, LumpVariables, StepVariables } from '@lumpcode/cli-utils';
import { load as loadYaml } from 'js-yaml';

import {
    projectRootFromConfigUrl,
    requireArtifactStep,
    resolveBacklogPaths,
    resolveImplValidateCommand,
    retryUntilGreenSteps,
    validateBaseBacklogItem,
} from '../../kit';
import type { BaseBacklogItem } from '../../types';
import { defineRecipe } from '../../types';
import { backlog } from '../backlog';
import {
    defaultDirectImplPrompt,
    defaultImplPrompt,
    defaultReqFixPrompt,
    defaultReqPrompt,
    defaultTestImplPrompt,
    defaultTestPlanFixPrompt,
    defaultTestPlanPrompt,
} from './defaultPrompts';
import { resolveFeatureBacklogDiscoveryOptions } from './discovery';
import { resolveFeatureBacklogItem } from './resolve';
import type { FeatureBacklogItem, FeatureBacklogOptions } from './types';
import {
    assertValidFeatureItemName,
    parentNameFromTodoRelativeDir,
    parseFeatureWorkflow,
    parseManual,
} from './workflow';

export {
    resolveFeatureBacklogDiscoveryOptions,
} from './discovery';
export { resolveFeatureBacklogItem } from './resolve';
export {
    DEFAULT_FEATURE_BACKLOG_WORKFLOW,
    DEFAULT_ITEM_DISCOVERY_BRANCH_PREFIX,
    DEFAULT_PRIMARY_DISCOVERY_BRANCH,
    FEATURE_BACKLOG_RESERVED_NAME_SUFFIXES,
    FEATURE_BACKLOG_WORKFLOW_STAGES,
    type FeatureBacklogContextVariables,
    type FeatureBacklogItem,
    type FeatureBacklogOptions,
    type FeatureBacklogPromptFns,
    type FeatureBacklogPromptStage,
    type FeatureBacklogStage,
    type FeatureBacklogTerminalStage,
    type FeatureBacklogWorkflow,
    type FeatureBacklogWorkflowStage,
} from './types';
export { parseFeatureWorkflow } from './workflow';
export {
    defaultDirectImplPrompt,
    defaultImplPrompt,
    defaultReqFixPrompt,
    defaultReqPrompt,
    defaultTestImplPrompt,
    defaultTestPlanFixPrompt,
    defaultTestPlanPrompt,
} from './defaultPrompts';

function mergeUniqueDependsOn(...lists: (string[] | undefined)[]): string[] | undefined {
    const merged = [...new Set(lists.flatMap((l) => l ?? []))];
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

export const featureBacklog = defineRecipe(function featureBacklog<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(options: FeatureBacklogOptions<V, SV>): LumpJsConfig<V, SV> {
    const {
        configUrl,
        implValidateCommand,
        backlogItemsDir,
        primaryDiscoveryBranch,
        itemDiscoveryBranchPrefix,
        promptFns,
        ...rest
    } = options;

    const discovery = resolveFeatureBacklogDiscoveryOptions({
        primaryDiscoveryBranch,
        itemDiscoveryBranchPrefix,
    });
    const projectRoot = projectRootFromConfigUrl(configUrl);
    const backlogPaths = resolveBacklogPaths(configUrl, { backlogItemsDir });
    const runImplValidation = resolveImplValidateCommand<V, SV>(
        implValidateCommand ??
            'echo "No implementation validation command provided. I say, trust but verify, but well..."',
    );

    return backlog<FeatureBacklogItem, V, SV>({
        configUrl,
        backlogItemsDir,
        includeUmbrellaParents: true,
        ...rest,
        discoveryBranches: [
            discovery.primaryDiscoveryBranch,
            `${discovery.itemDiscoveryBranchPrefix}/*`,
        ],
        parseItem(baseItem: BaseBacklogItem, folderName, raw) {
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
                          backlogItemsDir: backlogPaths.backlogItemsDir,
                          parentName,
                          ownDependsOn: baseItem.dependsOn,
                      })
                    : baseItem.dependsOn,
                manual: parseManual(baseItem.name, record),
                workflow: parseFeatureWorkflow(baseItem.name, raw),
            };
        },
        async resolveItem({ item, paths, discoveryBranch }) {
            return resolveFeatureBacklogItem({
                item,
                paths,
                projectRoot,
                discoveryBranch,
                primaryDiscoveryBranch: discovery.primaryDiscoveryBranch,
                itemDiscoveryBranchPrefix: discovery.itemDiscoveryBranchPrefix,
            });
        },
        stages: {
            req: {
                completion: 'keepPending',
                steps: retryUntilGreenSteps<V, SV>({
                    steps: [{ promptFn: promptFns?.req ?? defaultReqPrompt }],
                    validationCommandFn: requireArtifactStep<V, SV>('REQ_FILE'),
                    fixSteps: ({ prevValidateCommandResult }) => [
                        { promptFn: defaultReqFixPrompt(prevValidateCommandResult) },
                    ],
                }),
            },
            testPlan: {
                completion: 'keepPending',
                steps: retryUntilGreenSteps<V, SV>({
                    steps: [{ promptFn: promptFns?.testPlan ?? defaultTestPlanPrompt }],
                    validationCommandFn: requireArtifactStep<V, SV>('TEST_PLAN_FILE'),
                    fixSteps: ({ prevValidateCommandResult }) => [
                        { promptFn: defaultTestPlanFixPrompt(prevValidateCommandResult) },
                    ],
                }),
            },
            testImpl: {
                completion: 'keepPending',
                steps: [{ promptFn: promptFns?.testImpl ?? defaultTestImplPrompt }],
            },
            impl: {
                completion: 'moveToDone',
                steps: retryUntilGreenSteps<V, SV>({
                    steps: [{ promptFn: promptFns?.impl ?? defaultImplPrompt }],
                    validationCommandFn: runImplValidation,
                }),
            },
            directImpl: {
                completion: 'moveToDone',
                steps: retryUntilGreenSteps<V, SV>({
                    steps: [{ promptFn: promptFns?.directImpl ?? defaultDirectImplPrompt }],
                    validationCommandFn: runImplValidation,
                }),
            },
            completion: {
                completion: 'moveToDone',
                steps: [],
            },
        },
    });
});