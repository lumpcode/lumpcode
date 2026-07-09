import { defineConfig, type Context, type LumpJsConfig } from '@lumpcode/cli-types';

import {
    makeAbstractionBacklogContextListFn,
    resolveImplValidateCommand,
    setTaskDoneStep,
    type AbstractionBacklogContextVariables,
} from '../kit/backlog';
import { getRecursiveSteps } from '../kit/getRecursiveSteps';
import { defineRecipe, type Recipe } from '../types/recipe';
import type { SoloTaskValidateCommand } from './soloTask';

export type AbstractionBacklogOptions = {
    /** Lump folder name under `.lumpcode/lumps/<lumpName>/`. */
    lumpName: string;
    baseBranch: string;
    /** Git project root for remote context status; defaults to `process.cwd()`. */
    projectRoot?: string;
    /** Validation during impl; default CLI build + test. */
    implValidateCommand?: SoloTaskValidateCommand;
} & Omit<
    Partial<LumpJsConfig>,
    'getContextListFn' | 'steps' | 'baseBranch' | 'prompt' | 'contextListJson' | 'contextMatchFn'
>;

const DEFAULT_IMPL_VALIDATE_COMMAND = [
    'npm run build -w=@lumpcode/cli',
    'npm run test -w=@lumpcode/cli',
].join(' && ');

/**
 * YAML backlog for CLI util abstractions: PRD pre-written by abstractionFinder, then impl with tests.
 * Pair with `BACKLOG.yml`, `DONE.yml`, and `prds/` under the lump folder.
 */
export const abstractionBacklog: Recipe<AbstractionBacklogOptions> = defineRecipe((options) => {
    const {
        lumpName,
        baseBranch,
        projectRoot,
        implValidateCommand = DEFAULT_IMPL_VALIDATE_COMMAND,
        command = 'cursor',
        lumpVariables = { model: 'composer-2.5' },
        registerCommands = ['cursor'],
        numberOfContextsPerBranch = 1,
        maximumNumberOfConcurrentBranches = 1,
        verbose = true,
        keepHistory = true,
        ...rest
    } = options;

    const runImplValidation = resolveImplValidateCommand(implValidateCommand);

    return defineConfig({
        command,
        lumpVariables,
        registerCommands,
        getContextListFn: makeAbstractionBacklogContextListFn({ lumpName, baseBranch, projectRoot }),
        numberOfContextsPerBranch,
        maximumNumberOfConcurrentBranches,
        baseBranch,
        verbose,
        keepHistory,
        steps: [
            ({ context }) => {
                const { variables } = context as Context<AbstractionBacklogContextVariables>;
                const nextFlow = variables.NEXT_FLOW;

                if (nextFlow === 'impl') {
                    return [
                        ...getRecursiveSteps({
                            getFirstSteps({ currentIteration, prevValidateCommandResult }) {
                                return [
                                    {
                                        promptFn({ context: ctx }) {
                                            const vars = ctx.variables as AbstractionBacklogContextVariables;
                                            const { PRD_FILE, TASK_NAME, TASK } = vars;

                                            if (currentIteration === 0) {
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
                                            }

                                            return `
The CLI build or unit tests failed after the abstraction implementation. Fix the implementation and refactor so everything passes.

Verification commands:
${DEFAULT_IMPL_VALIDATE_COMMAND}

Verification output:

${prevValidateCommandResult}
                                            `.trim();
                                        },
                                    },
                                ];
                            },
                            validationCommandFn: (input) => runImplValidation(input),
                        }),
                        setTaskDoneStep,
                    ];
                }

                return [];
            },
        ],
        ...rest,
    });
});
