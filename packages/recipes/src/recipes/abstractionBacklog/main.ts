import { type LumpJsConfig } from '@lumpcode/cli-utils';
import { pathExists } from '@lumpcode/core';
import path from 'node:path';

import {
    projectRootFromConfigUrl,
    resolveImplValidateCommand,
    retryUntilGreen,
    type ValidationCommandFn,
} from '../../kit';
import { defineRecipe, type Recipe } from '../../types';
import { backlog } from '../backlog';

export type AbstractionBacklogOptions = {
    implValidateCommand?: ValidationCommandFn | string;
    /** Lump config module URL — pass `import.meta.url` from `config.ts`. */
    configUrl: string | URL;
    implSteps?: LumpJsConfig['steps'];
} & Omit<
    LumpJsConfig,
    'contextListJson' | 'contextMatchFn' | 'getContextListFn' | 'prompt' | 'steps'
>;

type AbstractionBacklogContextVariables = {
    TASK_NAME: string;
    TASK: string;
    BACKLOG_ITEMS_DIR: string;
    BACKLOG_ITEM_DIR: string;
    REQ_FILE?: string;
};

export const abstractionBacklog: Recipe<AbstractionBacklogOptions> = defineRecipe((options) => {
    const {
        implValidateCommand,
        configUrl,
        implSteps,
        ...rest
    } = options;

    const projectRoot = projectRootFromConfigUrl(configUrl);
    const runImplValidation = resolveImplValidateCommand(implValidateCommand ?? 'echo "No implementation validation command provided. I say, trust but verify, but well..."');

    return backlog({
        configUrl,
        async resolveItem({ item, paths }) {
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
        },
        stages: {
            implementation: {
                completion: 'moveToDone',
                steps: retryUntilGreen({
                    steps: implSteps ?? [{
                        promptFn({ context: ctx }) {
                            const vars = ctx.variables as AbstractionBacklogContextVariables;
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
                        },
                    }],
                    validationCommandFn: runImplValidation,
                }),
            },
        },
        ...rest,
    });
});
