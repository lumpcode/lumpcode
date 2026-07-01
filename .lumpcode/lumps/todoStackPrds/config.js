import { defineConfig } from '@lumpcode/cli-types';

export default defineConfig({
    command: 'cursor',
    getContextListFn: './contexts.js',
    numberOfContextsPerBranch: 1,
    disabled: true,
    maximumNumberOfConcurrentBranches: 2,
    steps: [
        {
            promptFn({ context }) {
                const {
                    TASK,
                    TASK_PRIORITY,
                    TASK_NAME,
                    PRD_FILE,
                    TODO_STACK_FILE,
                    DONE_STACK_FILE,
                    IMPLEMENT_PRD,
                } = context.variables;

                if (IMPLEMENT_PRD) {
                    return `
                        Implement the feature described in @${PRD_FILE}.

                        Backlog item: ${TASK_NAME}

                        Guidelines:
                        - Clean, readable code with clear naming
                        - DRY — reuse existing helpers and patterns; avoid duplicated logic
                        - Follow conventions already used in the Lumpcode monorepo (see @AGENTS.md and nearby code)
                        - Minimize repetition but avoid new big abstractions if not precisely specified in the PRD.
                        - Clean and not too long tests

                        Work through the PRD acceptance criteria. When implementation is complete, move the entry with \`name: ${TASK_NAME}\` from @${TODO_STACK_FILE} to @${DONE_STACK_FILE}.
                    `.trim();
                }

                const ref = context.variables.REF;
                const refSection = ref
                    ? `\n\nAdditional reference: @${ref}`
                    : '';

                return `
                    Write a product requirements document (PRD) for the following Lumpcode backlog item from @${TODO_STACK_FILE}.

                    Task name: ${TASK_NAME}
                    Backlog priority: ${TASK_PRIORITY}

                    Task:
                    ${TASK}${refSection}

                    Save the PRD to @${PRD_FILE}. Do not edit @${TODO_STACK_FILE}.

                    The PRD should be self-contained and implementation-ready for the Lumpcode monorepo. Include:
                    - Problem statement and motivation
                    - Goals and non-goals
                    - User stories / use cases
                    - Testing strategy (unit tests, and e2e for CLI if relevant)
                    - Docs updates (if relevant)
                    - Proposed behavior and UX (for CLI work, include command syntax where relevant)
                    - Technical approach and affected packages or docs
                    - Acceptance criteria
                    - Open questions and risks

                    Do not implement the feature — only create the PRD markdown file.
                `.trim();
            }, 
        },
    ],
});
