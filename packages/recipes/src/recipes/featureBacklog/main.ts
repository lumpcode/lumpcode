import type { LumpJsConfig, LumpVariables, StepVariables } from '@lumpcode/cli-utils';

import {
    projectRootFromConfigUrl,
    requireArtifactStep,
    resolveBacklogPaths,
    resolveImplValidateCommand,
    retryUntilGreenSteps,
} from '../../kit';
import type { BaseBacklogItem } from '../../types';
import { defineRecipe } from '../../types';
import { backlogSteps } from '../backlog';
import { parseFeatureBacklogFolderItem } from './item';
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
import type { FeatureBacklogItem, FeatureBacklogStepsOptions } from './types';

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
    type FeatureBacklogPromptInput,
    type FeatureBacklogPrompts,
    type FeatureBacklogStepsOptions,
    type FeatureBacklogStepsPromptFns,
    type FeatureBacklogValidateCommand,
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

export const featureBacklogSteps = defineRecipe(function featureBacklogSteps<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(options: FeatureBacklogStepsOptions<V, SV>): LumpJsConfig<V, SV> {
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

    return backlogSteps<FeatureBacklogItem, V, SV>({
        configUrl,
        backlogItemsDir,
        includeUmbrellaParents: true,
        ...rest,
        discoveryBranches: [
            discovery.primaryDiscoveryBranch,
            `${discovery.itemDiscoveryBranchPrefix}/*`,
        ],
        parseItem(baseItem: BaseBacklogItem, folderName, raw) {
            return parseFeatureBacklogFolderItem({
                baseItem,
                folderName,
                raw,
                projectRoot,
                backlogItemsDir: backlogPaths.backlogItemsDir,
                field: 'workflow',
            });
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