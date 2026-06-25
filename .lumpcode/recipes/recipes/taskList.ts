import fs from 'fs/promises';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';
import { defineConfig, Context } from '@lumpcode/cli-types';
import { getContextListFn, getRecursiveSteps, TodoYamlItem, type ContextVariables } from '../kit/getContextListFn';
import { CommandDescriptor, Step } from '@lumpcode/core';
import path from 'path';

export const taskListConfig = (baseBranch: string) => defineConfig({
    command: 'cursor',
    lumpVariables: {
        model: 'composer-2.5',
    },
    registerCommands: ['cursor',],
    getContextListFn: () => getContextListFn(baseBranch),
    numberOfContextsPerBranch: 1,
    maximumNumberOfConcurrentBranches: 5,
    baseBranch,
    verbose: true,
    keepHistory: true,
    steps: [
        ({
            context
        }) => {
            const {
                variables,
                name,
            } = context as Context<ContextVariables>;
            
            const ctxType = variables.TYPE;
            const nextFlow = variables.NEXT_FLOW;
            
            if (ctxType === 'feature' && nextFlow) {
                if (nextFlow === 'prd') {
                    return [
                        {
                            promptFn({
                                context,
                            }) {
                                const variables = context.variables as ContextVariables;
                                const {
                                    TODOS_FILE,
                                    TASK_NAME,
                                    TASK,
                                    REF,
                                    PRD_FILE,
                                } = variables;
                                
                                const refSection = REF
                                ? `\n\nAdditional reference: @${REF}`
                                : '';
                                
                                return `
                                    Write a product requirements document (PRD) for the following Lumpcode backlog item from @${TODOS_FILE}.
                                
                                    Task name: ${TASK_NAME}
                                
                                    Task:
                                    ${TASK}${refSection}
                                
                                    Save the PRD to @${PRD_FILE}. Do not edit @${TODOS_FILE}.
                                
                                    The PRD should be self-contained and implementation-ready for the Lumpcode monorepo. Include:
                                    - Problem statement and motivation
                                    - Goals and non-goals
                                    - User stories / use cases
                                    - Docs updates (if relevant)
                                    - Proposed behavior and UX (for CLI work, include command syntax where relevant)
                                    - Technical approach and affected packages or docs
                                    - Acceptance criteria
                                    - Open questions and risks
                                
                                    Do not implement the feature — only create the PRD markdown file.
                                    The PRD should not contain any testing strategy details.
                                `.trim();
                            }
                        }
                    ]
                }
                else if (nextFlow === 'testPlan') {
                    return [
                        {
                            promptFn({
                                context,
                            }) {
                                const variables = context.variables as ContextVariables;
                                const {
                                    TODOS_FILE,
                                    TASK_NAME,
                                    TASK,
                                    PRD_FILE,
                                    TEST_PLAN_FILE
                                } = variables;
                                
                                return `
                                    Write a test plan for the following Lumpcode backlog item from @${TODOS_FILE}.
                                
                                    Task name: ${TASK_NAME}
                                    Task:
                                    ${TASK}
                                
                                    The PRD for this task is @${PRD_FILE}. The test plan should match the requirements of the PRD.
                                
                                    Save the test plan to @${TEST_PLAN_FILE}. Do not edit @${TODOS_FILE} nor @${PRD_FILE}.
                                
                                    The test plan should be self-contained and implementation-ready for the Lumpcode monorepo. Include:
                                    - Test cases
                                    - Test data
                                    - Test expectations
                                    - Test implementation details
                                `.trim();
                            }
                        }
                    ]
                }
                else if (nextFlow === 'tests_impl') {
                    return [
                        {
                            promptFn({
                                context,
                            }) {
                                const variables = context.variables as ContextVariables;
                                
                                const {
                                    TODOS_FILE,
                                    TASK_NAME,
                                    TASK,
                                    PRD_FILE,
                                    TEST_PLAN_FILE
                                } = variables;
                                
                                return `
                                    Write a test implementation for the following Lumpcode backlog item from @${TODOS_FILE}.
                                
                                    Task name: ${TASK_NAME}
                                    Task:
                                    ${TASK}
                                
                                    Follow the test plan in @${TEST_PLAN_FILE}.
                                    The PRD for this task is @${PRD_FILE}.
                                `.trim();
                            }
                        }
                    ]
                }
                else if (nextFlow === 'impl') {
                    return [
                        ...getRecursiveSteps({
                            getFirstSteps({
                                currentIteration,
                                prevValidateCommandResult,
                            }) {
                                return [
                                    {
                                        promptFn({
                                            context
                                        }) {
                                            const variables = context.variables as ContextVariables;
                                            
                                            const {
                                                PRD_FILE,
                                                TEST_PLAN_FILE,
                                            } = variables;
                                            
                                            if (currentIteration === 0) {
                                                return `
                                                Implement the feature described in @${PRD_FILE}.
                                                The tests have already been implemented according to the test plan in @${TEST_PLAN_FILE}.
                                                The implementation should make the tests pass. Do not edit any test file.
                                            `.trim();
                                            }
                                            else {
                                                return `
                                                The unit tests \`npm run test -w @lumpcode/cli\` failed. Fix the implementation and make the tests pass.
                                                Here is the error of the tests: 
                                                
                                                ${prevValidateCommandResult}
                                            `.trim();
                                            }
                                        }
                                    }
                                ]
                            },
                            validationCommandFn(): CommandDescriptor | null {
                                return {
                                    executable: 'npm',
                                    args: ['run', 'test', '-w', '@lumpcode/cli'],
                                }
                            }
                        }),
                        setTaskDoneStep,
                    ]
                }
                return [];
            }
            else if (ctxType === 'documentation') {
                return [
                    {
                        promptFn({
                            context,
                        }) {
                            const variables = context.variables as ContextVariables;
                            
                            return `
                                Update the documentation of the project following these instructions:
                                ${variables.TASK}
                            `.trim();
                        }
                    },
                    setTaskDoneStep
                ]
            }
            else if (ctxType === 'misc') {
                return [
                    {
                        promptFn({
                            context,
                        }) {
                            const variables = context.variables as ContextVariables;
                            
                            return `
                                Follow these instructions:
                                ${variables.TASK}
                            `.trim();
                        }
                    },
                    setTaskDoneStep
                ]
            }
            return [];
        }
    ],
});

const setTaskDoneStep: Step = {
    async commandFn({
        context,
        workspacePath
    }) {
        const variables = context.variables as ContextVariables;
        const {
            TODOS_FILE,
        } = variables;

        const todosFilePath = path.join(workspacePath, TODOS_FILE);

        const openedTodosFile = await fs.readFile(todosFilePath, 'utf-8');
        const todos = loadYaml(openedTodosFile) as TodoYamlItem[];
        const todo = todos.find((todo: TodoYamlItem) => todo.name === context.name);
        if (todo) {
            todo.done = true;
            await fs.writeFile(todosFilePath, dumpYaml(todos));
        }

        return {
            executable: 'cat',
            args: [todosFilePath],
        }
    }
}