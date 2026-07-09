import { defineConfig, type Context, type LumpJsConfig } from '@lumpcode/cli-types';

import {
    makeBacklogContextListFn,
    resolveImplValidateCommand,
    setTaskDoneStep,
    type BacklogContextVariables,
} from '../kit/backlog';
import { getRecursiveSteps } from '../kit/getRecursiveSteps';
import { defineRecipe, type Recipe } from '../types/recipe';
import type { SoloTaskValidateCommand } from './soloTask';

export type BacklogOptions = {
    /** Lump folder name under `.lumpcode/lumps/<lumpName>/`. */
    lumpName: string;
    baseBranch: string;
    /** Git project root for remote context status; defaults to `process.cwd()`. */
    projectRoot?: string;
    /** Validation run during the feature `impl` phase; default `npm run test -w @lumpcode/cli`. */
    implValidateCommand?: SoloTaskValidateCommand;
} & Omit<
    Partial<LumpJsConfig>,
    'getContextListFn' | 'steps' | 'baseBranch' | 'prompt' | 'contextListJson' | 'contextMatchFn'
>;

/**
 * YAML backlog with phased features (prd → testPlan → tests_impl → impl), plus documentation and misc tasks.
 * Pair with `BACKLOG.yml`, `DONE.yml`, and optional `prds/` / `testPlans/` under the lump folder.
 */
export const backlog: Recipe<BacklogOptions> = defineRecipe((options) => {
    const {
        lumpName,
        baseBranch,
        projectRoot,
        implValidateCommand = {
            executable: 'npm',
            args: ['run', 'test', '-w', '@lumpcode/cli'],
        },
        command = 'cursor',
        lumpVariables = { model: 'composer-2.5' },
        registerCommands = ['cursor'],
        numberOfContextsPerBranch = 1,
        maximumNumberOfConcurrentBranches = 5,
        verbose = true,
        keepHistory = true,
        ...rest
    } = options;

    const runImplValidation = resolveImplValidateCommand(implValidateCommand);

    return defineConfig({
        command,
        lumpVariables,
        registerCommands,
        getContextListFn: makeBacklogContextListFn({ lumpName, baseBranch, projectRoot }),
        numberOfContextsPerBranch,
        maximumNumberOfConcurrentBranches,
        baseBranch,
        verbose,
        keepHistory,
        steps: [
            ({ context }) => {
                const { variables } = context as Context<BacklogContextVariables>;
                const ctxType = variables.TYPE;
                const nextFlow = variables.NEXT_FLOW;

                if (ctxType === 'feature' && nextFlow) {
                    if (nextFlow === 'prd') {
                        return [
                            {
                                promptFn({ context: ctx }) {
                                    const vars = ctx.variables as BacklogContextVariables;
                                    const { BACKLOG_FILE, TASK_NAME, TASK, PRD_FILE } = vars;

                                    return `
Write a product requirements document (PRD) for the following Lumpcode backlog item from @${BACKLOG_FILE}.

Task name: ${TASK_NAME}

Task:
${TASK}

Save the PRD to @${PRD_FILE}. Do not edit @${BACKLOG_FILE}.

The PRD should be self-contained and implementation-ready. Include:
- Problem statement and motivation
- Goals and non-goals
- User stories / use cases
- Docs updates (if relevant)
- Proposed behavior and UX (for CLI work, include command syntax where relevant)
- Technical approach and affected packages or docs
- Acceptance criteria

Do not implement the feature — only create the PRD markdown file.
The PRD should not contain any testing strategy details.
                                    `.trim();
                                },
                            },
                        ];
                    }

                    if (nextFlow === 'testPlan') {
                        return [
                            {
                                promptFn({ context: ctx }) {
                                    const vars = ctx.variables as BacklogContextVariables;
                                    const { BACKLOG_FILE, TASK_NAME, TASK, PRD_FILE, TEST_PLAN_FILE } = vars;

                                    return `
Write a test plan for the following Lumpcode backlog item from @${BACKLOG_FILE}.

Task name: ${TASK_NAME}
Task:
${TASK}

The PRD for this task is @${PRD_FILE}. The test plan should match the requirements of the PRD.

Save the test plan to @${TEST_PLAN_FILE}. Do not edit @${BACKLOG_FILE} nor @${PRD_FILE}.

The test plan should be self-contained and implementation-ready. Include:
- Test cases
- Test data
- Test expectations
- Test implementation details
                                    `.trim();
                                },
                            },
                        ];
                    }

                    if (nextFlow === 'tests_impl') {
                        return [
                            {
                                promptFn({ context: ctx }) {
                                    const vars = ctx.variables as BacklogContextVariables;
                                    const { BACKLOG_FILE, TASK_NAME, TASK, PRD_FILE, TEST_PLAN_FILE } = vars;

                                    return `
Write a test implementation for the following Lumpcode backlog item from @${BACKLOG_FILE}.

Task name: ${TASK_NAME}
Task:
${TASK}

Follow the test plan in @${TEST_PLAN_FILE}.
The PRD for this task is @${PRD_FILE}.
                                    `.trim();
                                },
                            },
                        ];
                    }

                    if (nextFlow === 'impl') {
                        return [
                            ...getRecursiveSteps({
                                getFirstSteps({ currentIteration, prevValidateCommandResult }) {
                                    return [
                                        {
                                            promptFn({ context: ctx }) {
                                                const vars = ctx.variables as BacklogContextVariables;
                                                const { PRD_FILE, TEST_PLAN_FILE } = vars;

                                                if (currentIteration === 0) {
                                                    return `
Implement the feature described in @${PRD_FILE}.
The tests have already been implemented according to the test plan in @${TEST_PLAN_FILE}.
The implementation should make the tests pass. Do not edit any test file.
                                                    `.trim();
                                                }

                                                return `
The verification command failed. Fix the implementation and make the tests pass.

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
                }

                if (ctxType === 'documentation') {
                    return [
                        {
                            promptFn({ context: ctx }) {
                                const vars = ctx.variables as BacklogContextVariables;
                                return `
Update the documentation of the project following these instructions:
${vars.TASK}
                                `.trim();
                            },
                        },
                        setTaskDoneStep,
                    ];
                }

                if (ctxType === 'misc') {
                    return [
                        {
                            promptFn({ context: ctx }) {
                                const vars = ctx.variables as BacklogContextVariables;
                                return `
Follow these instructions:
${vars.TASK}
                                `.trim();
                            },
                        },
                        setTaskDoneStep,
                    ];
                }

                return [];
            },
        ],
        ...rest,
    });
});
