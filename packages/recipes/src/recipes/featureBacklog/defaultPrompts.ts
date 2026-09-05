import type { PromptFn } from '@lumpcode/cli-utils';

import type { FeatureBacklogContextVariables } from './types';

function featureContextVars(context: { variables: unknown }): FeatureBacklogContextVariables {
    return context.variables as FeatureBacklogContextVariables;
}

export const defaultReqPrompt: PromptFn = ({ context }) => {
    const { BACKLOG_ITEM_DIR, TASK_NAME, TASK, REQ_FILE } = featureContextVars(context);
    return `
Write a requirements document for the following backlog item from @${BACKLOG_ITEM_DIR}/desc.yml.

Task name: ${TASK_NAME}

Task:
${TASK}

Save the requirements document to @${REQ_FILE}. Do not edit @${BACKLOG_ITEM_DIR}/desc.yml.

The requirements document should be self-contained and implementation-ready. Include:
- Problem statement and motivation
- Goals and non-goals
- User stories / use cases
- Docs updates (if relevant)
- Proposed behavior and UX (for CLI work, include command syntax where relevant)
- Technical approach and affected packages or docs
- Acceptance criteria

Do not implement the feature — only create the requirements markdown file.
Do not wait the user to answer any questions — make the best assumptions and just write the requirements document.
The requirements document should not contain any testing strategy details.
    `.trim();
};

export function defaultReqFixPrompt(prevValidateCommandResult?: string | null): PromptFn {
    return ({ context }) => {
        const { BACKLOG_ITEM_DIR, REQ_FILE } = featureContextVars(context);
        return `
The requirements document was not created at @${REQ_FILE}.

Create it now at that exact path. Do not edit @${BACKLOG_ITEM_DIR}/desc.yml.
Do not implement the feature — only write the requirements markdown file.
The requirements document should not contain any testing strategy details.

Verification output:
${prevValidateCommandResult ?? '(no output captured)'}
        `.trim();
    };
}

export const defaultTestPlanPrompt: PromptFn = ({ context }) => {
    const { BACKLOG_ITEM_DIR, TASK_NAME, TASK, REQ_FILE, TEST_PLAN_FILE } = featureContextVars(context);
    return `
Write a test plan for the following backlog item from @${BACKLOG_ITEM_DIR}/desc.yml.

Task name: ${TASK_NAME}
Task:
${TASK}

The requirements for this task are in @${REQ_FILE}. The test plan should match those requirements.

Save the test plan to @${TEST_PLAN_FILE}. Do not edit @${BACKLOG_ITEM_DIR}/desc.yml nor @${REQ_FILE}.

The test plan should be self-contained and implementation-ready. Include:
- Test cases
- Test data
- Test expectations
- Test implementation details
    `.trim();
};

export function defaultTestPlanFixPrompt(prevValidateCommandResult?: string | null): PromptFn {
    return ({ context }) => {
        const { BACKLOG_ITEM_DIR, REQ_FILE, TEST_PLAN_FILE } = featureContextVars(context);
        return `
The test plan was not created at @${TEST_PLAN_FILE}.

Create it now at that exact path. Match the requirements in @${REQ_FILE}.
Do not edit @${BACKLOG_ITEM_DIR}/desc.yml nor @${REQ_FILE}.

Verification output:
${prevValidateCommandResult ?? '(no output captured)'}
        `.trim();
    };
}

export const defaultTestImplPrompt: PromptFn = ({ context }) => {
    const { BACKLOG_ITEM_DIR, TASK_NAME, TASK, REQ_FILE, TEST_PLAN_FILE } = featureContextVars(context);
    const planLine = TEST_PLAN_FILE
        ? `Follow the test plan in @${TEST_PLAN_FILE}.`
        : 'Write skipped tests from the requirements and your judgement. Do not create a testPlan.md.';
    return `
Write a test implementation for the following backlog item from @${BACKLOG_ITEM_DIR}/desc.yml.

The new tests should be skipped in order to not break the whole test suite.

Task name: ${TASK_NAME}
Task:
${TASK}

${planLine}
The requirements for this task are in @${REQ_FILE}.
    `.trim();
};

export const defaultImplPrompt: PromptFn = ({ context }) => {
    const { REQ_FILE, TEST_PLAN_FILE, WORKFLOW } = featureContextVars(context);
    const wantsTestImpl = (WORKFLOW ?? '').split(',').includes('testImpl');
    if (wantsTestImpl) {
        return `
Implement the feature described in @${REQ_FILE}.
The tests have already been implemented according to the test plan${TEST_PLAN_FILE ? ` in @${TEST_PLAN_FILE}` : ''}.
Unskip all the tests that were skipped in the tests implementation.
The implementation should make the tests pass. Do not edit any test file except to unskip them or if absolutely necessary.
        `.trim();
    }
    if (TEST_PLAN_FILE) {
        return `
Implement the feature described in @${REQ_FILE}.
Write or update tests to match the test plan in @${TEST_PLAN_FILE}, and make validation pass.
Do not edit @${REQ_FILE} unless absolutely necessary.
        `.trim();
    }
    return `
Implement the feature described in @${REQ_FILE}.
Add or update tests as needed so the suite covers the change, and make validation pass.
Do not edit @${REQ_FILE} unless absolutely necessary.
    `.trim();
};

export const defaultDirectImplPrompt: PromptFn = ({ context }) => {
    const { BACKLOG_ITEM_DIR, REQ_FILE, TEST_PLAN_FILE } = featureContextVars(context);
    const extras = [
        REQ_FILE ? `Use the requirements in @${REQ_FILE}.` : '',
        TEST_PLAN_FILE ? `Use the test plan in @${TEST_PLAN_FILE} for tests.` : '',
    ]
        .filter(Boolean)
        .join('\n');
    return `
Implement the feature described in @${BACKLOG_ITEM_DIR}/desc.yml.
${extras}
Add tests as needed so the suite covers the change, and make validation pass.
    `.trim();
};
