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
} & Omit<
    LumpJsConfig,
    'contextListJson' | 'contextMatchFn' | 'getContextListFn' | 'prompt' | 'steps'
>;

const DEFAULT_IMPL_VALIDATE_COMMAND = [
    'npm run build -w=@lumpcode/cli',
    'npm run test -w=@lumpcode/cli',
].join(' && ');

type AbstractionBacklogContextVariables = {
    TASK_NAME: string;
    TASK: string;
    BACKLOG_FILE: string;
    DONE_FILE: string;
    PRD_FILE?: string;
};

export const abstractionBacklog: Recipe<AbstractionBacklogOptions> = defineRecipe((options) => {
    const {
        implValidateCommand = DEFAULT_IMPL_VALIDATE_COMMAND,
        configUrl,
        ...rest
    } = options;

    const projectRoot = projectRootFromConfigUrl(configUrl);
    const runImplValidation = resolveImplValidateCommand(implValidateCommand);

    return backlog({
        configUrl,
        async resolveItem({ item, paths }) {
            const itemPrdPath = path.join(paths.lumpPath, 'prds', `${item.name}.prd.md`);
            const hasPrd = await pathExists(path.join(projectRoot, itemPrdPath));
            if (!hasPrd) {
                return { ignored: true };
            }

            return {
                stage: 'implementation',
                variables: {
                    PRD_FILE: itemPrdPath,
                },
            };
        },
        stages: {
            implementation: {
                completion: 'moveToDone',
                steps: retryUntilGreen({
                    steps: [{
                        promptFn({ context: ctx }) {
                            const vars = ctx.variables as AbstractionBacklogContextVariables;
                            const { PRD_FILE, TASK_NAME, TASK } = vars;
                            return `
                        Implement the abstraction described in @${PRD_FILE}.
                        
                        Backlog item: ${TASK_NAME}
                        Task summary:
                        ${TASK}
                        
                        Requirements:
                        - Materialize the abstraction as a new util under packages/apps/cli/src/utils/<utilName>/ following existing conventions: main.ts (implementation), index.ts (re-export), unit.test.ts (unit tests), and a barrel export from packages/apps/cli/src/utils/index.ts.
                        - Refactor all call sites in packages/apps/cli to import the new util.
                        - Net line count must go down after the refactor (removed duplication minus new util code, excluding the new unit test file). Do not extract one-off logic or move code without deleting repetition.
                        - Include unit tests in unit.test.ts (match sibling utils in packages/apps/cli/src/utils/).
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
