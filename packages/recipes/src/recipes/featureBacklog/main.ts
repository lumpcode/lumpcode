import type { LumpJsConfig, LumpVariables, StepVariables } from '@lumpcode/cli-utils';

import {
    projectRootFromConfigUrl,
    requireArtifactStep,
    resolveImplValidateCommand,
    retryUntilGreen,
} from '../../kit';
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
        parseItem(baseItem, folderName, raw) {
            assertValidFeatureItemName(baseItem.name);
            const record = raw as Record<string, unknown>;
            const parentName = parentNameFromTodoRelativeDir(folderName);
            return {
                ...baseItem,
                todoRelativeDir: folderName,
                parentName,
                dependsOn: parentName
                    ? baseItem.dependsOn?.map((dep) => `${parentName}-${dep}`)
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
                steps: retryUntilGreen<V, SV>({
                    steps: [{ promptFn: promptFns?.req ?? defaultReqPrompt }],
                    validationCommandFn: requireArtifactStep<V, SV>('REQ_FILE'),
                    fixSteps: ({ prevValidateCommandResult }) => [
                        { promptFn: defaultReqFixPrompt(prevValidateCommandResult) },
                    ],
                }),
            },
            testPlan: {
                completion: 'keepPending',
                steps: retryUntilGreen<V, SV>({
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
                steps: retryUntilGreen<V, SV>({
                    steps: [{ promptFn: promptFns?.impl ?? defaultImplPrompt }],
                    validationCommandFn: runImplValidation,
                }),
            },
            directImpl: {
                completion: 'moveToDone',
                steps: retryUntilGreen<V, SV>({
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
