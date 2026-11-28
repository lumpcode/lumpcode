import path from 'node:path';

import {
    type LumpJsConfig,
    type LumpVariables,
    type StepVariables,
} from '@lumpcode/cli-utils';
import { pathExists } from '@lumpcode/core';

import {
    projectRootFromConfigUrl,
    resolveImplValidateCommand,
    retryUntilGreenSteps,
    type BacklogPaths,
    type ValidationCommandFn,
} from '../../kit';
import { defineRecipe, type BaseBacklogItem } from '../../types';
import { backlogSteps, type BacklogItemResolution } from '../backlog';

export type AbstractionBacklogStepsOptions<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    implValidateCommand?: ValidationCommandFn<V, SV> | string;
    /** Lump config module URL — pass `import.meta.url` from `config.ts`. */
    configUrl: string | URL;
    implSteps?: LumpJsConfig<V, SV>['steps'];
} & Omit<
    LumpJsConfig<V, SV>,
    'contextListJson' | 'contextMatchFn' | 'getContextListFn' | 'prompt' | 'steps' | 'workflow'
>;

type AbstractionBacklogContextVariables = {
    TASK_NAME: string;
    TASK: string;
    BACKLOG_ITEMS_DIR: string;
    BACKLOG_ITEM_DIR: string;
    REQ_FILE?: string;
};

export function abstractionImplementationPrompt(context: { variables: unknown }): string {
    const vars = context.variables as AbstractionBacklogContextVariables;
    const { REQ_FILE, TASK_NAME, TASK } = vars;
    return `
                        Implement the abstraction described in @${REQ_FILE}.
                        
                        Backlog item: ${TASK_NAME}
                        Task summary:
                        ${TASK}
                        
                        Requirements:
                        - Materialize the abstraction as a new util following existing conventions in the codebase.
                        - Refactor all call sites to import the new util.
                        - Net line count must go down after the refactor (removed duplication minus new util code, excluding the new unit test file). Do not extract one-off logic or move code without deleting repetition.
                        - Include unit tests for the new util.
                        `.trim();
}

export async function resolveAbstractionBacklogItem(input: {
    item: BaseBacklogItem;
    paths: BacklogPaths;
    projectRoot: string;
}): Promise<BacklogItemResolution<'implementation'>> {
    const { item, paths, projectRoot } = input;
    const itemReqPath = path.join(paths.backlogItemsDir, 'todo', item.name, 'requirements.md');
    const hasReq = await pathExists(path.join(projectRoot, itemReqPath));
    if (!hasReq) {
        return { ignored: true };
    }

    return {
        stage: 'implementation',
        variables: {
            REQ_FILE: itemReqPath,
        },
    };
}

export const abstractionBacklogSteps = defineRecipe(function abstractionBacklogSteps<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(options: AbstractionBacklogStepsOptions<V, SV>): LumpJsConfig<V, SV> {
    const {
        implValidateCommand,
        configUrl,
        implSteps,
        ...rest
    } = options;

    const projectRoot = projectRootFromConfigUrl(configUrl);
    const runImplValidation = resolveImplValidateCommand<V, SV>(
        implValidateCommand ??
            'echo "No implementation validation command provided. I say, trust but verify, but well..."',
    );

    return backlogSteps<BaseBacklogItem, V, SV>({
        configUrl,
        resolveItem: ({ item, paths }) => resolveAbstractionBacklogItem({
            item,
            paths,
            projectRoot,
        }),
        stages: {
            implementation: {
                completion: 'moveToDone',
                steps: retryUntilGreenSteps<V, SV>({
                    steps: implSteps ?? [{
                        promptFn({ context: ctx }) {
                            return abstractionImplementationPrompt(ctx);
                        },
                    }],
                    validationCommandFn: runImplValidation,
                }),
            },
        },
        ...rest,
    });
});
