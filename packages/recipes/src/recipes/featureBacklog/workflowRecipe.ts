import type { LumpJsConfig, LumpVariables, PromptFn, StepVariables } from '@lumpcode/cli-utils';
import type { CommandDescriptor, WorkflowFn, WorkflowInput } from '@lumpcode/core';

import { projectRootFromConfigUrl, requireArtifact, resolveBacklogPaths, retryUntilGreen } from '../../kit';
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
import { parseFeatureBacklogFolderItem } from './item';
import { resolveFeatureBacklogItem } from './resolve';
import type {
    FeatureBacklogItem,
    FeatureBacklogOptions,
    FeatureBacklogPromptStage,
    FeatureBacklogPrompts,
    FeatureBacklogValidateCommand,
} from './types';

const CHECKS_PASSED = 'Checks passed.';

function checksMessage(succeeded: boolean, maxAttempts: number): { succeeded: boolean; message: string } {
    if (succeeded) {
        return { succeeded: true, message: CHECKS_PASSED };
    }
    return { succeeded: false, message: `Tests still red after ${maxAttempts} attempts.` };
}

async function promptText<V extends LumpVariables>(input: {
    prompt: FeatureBacklogPrompts<V>[FeatureBacklogPromptStage] | undefined;
    fallback: PromptFn;
    workflowInput: WorkflowInput<V>;
}): Promise<string> {
    const { prompt, fallback, workflowInput } = input;
    if (typeof prompt === 'string') {
        return prompt;
    }
    if (typeof prompt === 'function') {
        return prompt({
            context: workflowInput.context,
            lumpVariables: workflowInput.lumpVariables,
        });
    }
    return fallback({
        context: workflowInput.context,
        lumpVariables: workflowInput.lumpVariables,
        stepIndex: 0,
        contextRunState: workflowInput.contextRunState,
    });
}

async function resolveValidateCommand<V extends LumpVariables>(
    command: FeatureBacklogValidateCommand<V> | undefined,
    workflowInput: WorkflowInput<V>,
): Promise<string | CommandDescriptor | null> {
    if (command === undefined) {
        return null;
    }
    if (typeof command === 'function') {
        return command({
            context: workflowInput.context,
            lumpVariables: workflowInput.lumpVariables,
        });
    }
    return command;
}

function artifactWorkflow<V extends LumpVariables, SV extends StepVariables>(input: {
    prompt: FeatureBacklogPrompts<V>[FeatureBacklogPromptStage] | undefined;
    fallback: PromptFn;
    fixPrompt: PromptFn;
    pathVariable: string;
}): WorkflowFn<V, SV> {
    return async (workflowInput) => {
        const session = await workflowInput.agent.session();
        const text = await promptText({
            prompt: input.prompt,
            fallback: input.fallback,
            workflowInput,
        });
        await session.prompt(text);
        const relativePath = String(workflowInput.context.variables[input.pathVariable] ?? '');
        const fix = await input.fixPrompt({
            context: workflowInput.context,
            lumpVariables: workflowInput.lumpVariables,
            stepIndex: 0,
            contextRunState: workflowInput.contextRunState,
        });
        const artifact = await requireArtifact({
            session,
            workspacePath: workflowInput.workspacePath,
            path: relativePath,
            prompt: fix,
        });
        if (artifact.succeeded) {
            return { succeeded: true, message: `Wrote ${artifact.path}.` };
        }
        return { succeeded: false, message: `Missing ${artifact.path}.` };
    };
}

function checkWorkflow<V extends LumpVariables, SV extends StepVariables>(input: {
    prompt: FeatureBacklogPrompts<V>[FeatureBacklogPromptStage] | undefined;
    fallback: PromptFn;
    implValidateCommand: FeatureBacklogValidateCommand<V> | undefined;
    maxAttempts: number;
}): WorkflowFn<V, SV> {
    return async (workflowInput) => {
        const session = await workflowInput.agent.session();
        const text = await promptText({
            prompt: input.prompt,
            fallback: input.fallback,
            workflowInput,
        });
        await session.prompt(text);
        const check = await resolveValidateCommand(input.implValidateCommand, workflowInput);
        if (check == null) {
            return { succeeded: true, message: CHECKS_PASSED };
        }
        const loop = await retryUntilGreen({
            session,
            shell: workflowInput.shell,
            check,
            maxAttempts: input.maxAttempts,
        });
        return checksMessage(loop.succeeded, input.maxAttempts);
    };
}

export const featureBacklog = defineRecipe(function featureBacklog<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(options: FeatureBacklogOptions<V, SV>): LumpJsConfig<V, SV> {
    const {
        configUrl,
        implValidateCommand,
        maxAttempts = 3,
        backlogItemsDir,
        primaryDiscoveryBranch,
        itemDiscoveryBranchPrefix,
        prompts,
        ...rest
    } = options;

    const discovery = resolveFeatureBacklogDiscoveryOptions({
        primaryDiscoveryBranch,
        itemDiscoveryBranchPrefix,
    });
    const projectRoot = projectRootFromConfigUrl(configUrl);
    const backlogPaths = resolveBacklogPaths(configUrl, { backlogItemsDir });

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
            return parseFeatureBacklogFolderItem({
                baseItem,
                folderName,
                raw,
                projectRoot,
                backlogItemsDir: backlogPaths.backlogItemsDir,
                field: 'stages',
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
                stagesField: true,
            });
        },
        stages: {
            req: {
                completion: 'keepPending',
                workflow: artifactWorkflow<V, SV>({
                    prompt: prompts?.req,
                    fallback: defaultReqPrompt,
                    fixPrompt: defaultReqFixPrompt(),
                    pathVariable: 'REQ_FILE',
                }),
            },
            testPlan: {
                completion: 'keepPending',
                workflow: artifactWorkflow<V, SV>({
                    prompt: prompts?.testPlan,
                    fallback: defaultTestPlanPrompt,
                    fixPrompt: defaultTestPlanFixPrompt(),
                    pathVariable: 'TEST_PLAN_FILE',
                }),
            },
            testImpl: {
                completion: 'keepPending',
                workflow: checkWorkflow<V, SV>({
                    prompt: prompts?.testImpl,
                    fallback: defaultTestImplPrompt,
                    implValidateCommand,
                    maxAttempts,
                }),
            },
            impl: {
                completion: 'moveToDone',
                workflow: checkWorkflow<V, SV>({
                    prompt: prompts?.impl,
                    fallback: defaultImplPrompt,
                    implValidateCommand,
                    maxAttempts,
                }),
            },
            directImpl: {
                completion: 'moveToDone',
                workflow: checkWorkflow<V, SV>({
                    prompt: prompts?.directImpl,
                    fallback: defaultDirectImplPrompt,
                    implValidateCommand,
                    maxAttempts,
                }),
            },
            completion: {
                completion: 'moveToDone',
                workflow: async (workflowInput) => {
                    const taskName = workflowInput.context.variables.TASK_NAME;
                    const name = typeof taskName === 'string' && taskName.length > 0
                        ? taskName
                        : workflowInput.context.name;
                    return { succeeded: true, message: `Moved ${name} to completed.` };
                },
            },
        },
    });
});
