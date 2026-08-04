import path from 'node:path';

import {
    getContextStatus,
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import { pathExists } from '@lumpcode/core';
import {
    backlog,
    projectRootFromConfigUrl,
    requireArtifactStep,
    resolveImplValidateCommand,
    retryUntilGreen,
    type BaseBacklogItem,
    type BacklogPaths,
} from '@lumpcode/recipes';

type FeatureBacklogItem = BaseBacklogItem & {
    manualReq?: boolean;
};

type FeatureBacklogStage = 'makeReq' | 'makeTestPlan' | 'testImpl' | 'implementation';

type FeatureBacklogContextVariables = {
    TASK_NAME: string;
    TASK: string;
    BACKLOG_ITEMS_DIR: string;
    BACKLOG_ITEM_DIR: string;
    BACKLOG_STAGE: FeatureBacklogStage;
    REQ_FILE?: string;
    TEST_PLAN_FILE?: string;
};

const RESERVED_NAME_SUFFIXES = ['_req', '_testPlan', '_tests_impl'] as const;

function assertValidFeatureItemName(name: string): void {
    for (const suffix of RESERVED_NAME_SUFFIXES) {
        if (name.endsWith(suffix)) {
            throw new Error(`Backlog item name must not end with reserved suffix ${suffix}: ${name}`);
        }
    }
}

function featureContextName(itemName: string, stage: FeatureBacklogStage): string {
    switch (stage) {
        case 'makeReq':
            return `${itemName}_req`;
        case 'makeTestPlan':
            return `${itemName}_testPlan`;
        case 'testImpl':
            return `${itemName}_tests_impl`;
        case 'implementation':
            return itemName;
        default: {
            const _exhaustive: never = stage;
            return _exhaustive;
        }
    }
}

/**
 * Map concrete discovery branch → todo folder name(s).
 * `feature/a` keeps `feature-a` and `feature-a-*`.
 * `dev` keeps items not scoped to a `feature-*` folder.
 */
function itemMatchesDiscoveryBranch(itemName: string, discoveryBranch: string): boolean {
    const key = discoveryBranch.split('feature/')[1];
    console.log('on branch', discoveryBranch, 'item', itemName, 'key', key);
    return itemName === key;
}

async function resolveFeatureBacklogItem(input: {
    item: FeatureBacklogItem;
    paths: BacklogPaths;
    projectRoot: string;
    discoveryBranch: string;
}): Promise<
    | { ignored: true }
    | {
          stage: FeatureBacklogStage;
          contextName: string;
          variables: Record<string, string>;
      }
> {
    const { item, paths, projectRoot, discoveryBranch } = input;

    if (!itemMatchesDiscoveryBranch(item.name, discoveryBranch)) {
        return { ignored: true };
    }

    const reqFilePath = path.join(paths.backlogItemsDir, 'todo', item.name, 'requirements.md');
    const testPlanFilePath = path.join(paths.backlogItemsDir, 'todo', item.name, 'testPlan.md');

    const hasReq = await pathExists(path.join(projectRoot, reqFilePath));
    if (!hasReq) {
        if (item.manualReq === true) {
            return { ignored: true };
        }

        return {
            stage: 'makeReq',
            contextName: featureContextName(item.name, 'makeReq'),
            variables: { REQ_FILE: reqFilePath },
        };
    }

    const hasTestPlan = await pathExists(path.join(projectRoot, testPlanFilePath));
    if (!hasTestPlan) {
        return {
            stage: 'makeTestPlan',
            contextName: featureContextName(item.name, 'makeTestPlan'),
            variables: {
                REQ_FILE: reqFilePath,
                TEST_PLAN_FILE: testPlanFilePath,
            },
        };
    }

    const testsImplContextName = featureContextName(item.name, 'testImpl');
    const testsImplStatus = await getContextStatus({
        projectRoot,
        contextName: testsImplContextName,
        lumpName: paths.lumpName,
        baseBranch: discoveryBranch,
    });

    if (testsImplStatus === 'finished') {
        return {
            stage: 'implementation',
            contextName: featureContextName(item.name, 'implementation'),
            variables: {
                REQ_FILE: reqFilePath,
                TEST_PLAN_FILE: testPlanFilePath,
            },
        };
    }

    if (testsImplStatus === 'branchPushed') {
        return { ignored: true };
    }

    return {
        stage: 'testImpl',
        contextName: testsImplContextName,
        variables: {
            REQ_FILE: reqFilePath,
            TEST_PLAN_FILE: testPlanFilePath,
        },
    };
}

const configUrl = import.meta.url;
const projectRoot = projectRootFromConfigUrl(configUrl);
const runImplValidation = resolveImplValidateCommand<
    CursorPresetLumpVariables,
    CursorPresetStepVariables
>(['npm run build -w=@lumpcode/cli', 'npm run test -w=@lumpcode/cli'].join(' && '));

export default backlog<
    FeatureBacklogItem,
    CursorPresetLumpVariables,
    CursorPresetStepVariables
>({
    configUrl,
    command: 'cursor',
    registerCommands: ['cursor'],
    maximumNumberOfConcurrentBranches: 2,
    verbose: true,
    keepHistory: true,
    lumpVariables: { model: 'cursor-grok-4.5-high-fast' },
    discoveryBranch: 'feature/*',
    parseItem(baseItem, _folderName, raw) {
        assertValidFeatureItemName(baseItem.name);
        const record = raw as Record<string, unknown>;
        if (record.manualReq !== undefined && typeof record.manualReq !== 'boolean') {
            throw new Error(`Backlog item "${baseItem.name}" field "manualReq" must be a boolean`);
        }
        return {
            ...baseItem,
            manualReq: record.manualReq === true ? true : undefined,
        };
    },
    async resolveItem({ item, paths, discoveryBranch }) {
        return resolveFeatureBacklogItem({
            item,
            paths,
            projectRoot,
            discoveryBranch,
        });
    },
    stages: {
        makeReq: {
            completion: 'keepPending',
            steps: retryUntilGreen<CursorPresetLumpVariables, CursorPresetStepVariables>({
                steps: [
                    {
                        promptFn({ context: ctx }) {
                            const vars = ctx.variables as FeatureBacklogContextVariables;
                            const { BACKLOG_ITEM_DIR, TASK_NAME, TASK, REQ_FILE } = vars;

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
                        },
                    },
                ],
                validationCommandFn: requireArtifactStep<
                    CursorPresetLumpVariables,
                    CursorPresetStepVariables
                >('REQ_FILE'),
                fixSteps: ({ prevValidateCommandResult }) => [
                    {
                        promptFn({ context: ctx }) {
                            const vars = ctx.variables as FeatureBacklogContextVariables;
                            const { BACKLOG_ITEM_DIR, REQ_FILE } = vars;

                            return `
The requirements document was not created at @${REQ_FILE}.

Create it now at that exact path. Do not edit @${BACKLOG_ITEM_DIR}/desc.yml.
Do not implement the feature — only write the requirements markdown file.
The requirements document should not contain any testing strategy details.

Verification output:
${prevValidateCommandResult ?? '(no output captured)'}
                            `.trim();
                        },
                    },
                ],
            }),
        },
        makeTestPlan: {
            completion: 'keepPending',
            steps: retryUntilGreen<CursorPresetLumpVariables, CursorPresetStepVariables>({
                steps: [
                    {
                        promptFn({ context: ctx }) {
                            const vars = ctx.variables as FeatureBacklogContextVariables;
                            const { BACKLOG_ITEM_DIR, TASK_NAME, TASK, REQ_FILE, TEST_PLAN_FILE } =
                                vars;

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
                        },
                    },
                ],
                validationCommandFn: requireArtifactStep<
                    CursorPresetLumpVariables,
                    CursorPresetStepVariables
                >('TEST_PLAN_FILE'),
                fixSteps: ({ prevValidateCommandResult }) => [
                    {
                        promptFn({ context: ctx }) {
                            const vars = ctx.variables as FeatureBacklogContextVariables;
                            const { BACKLOG_ITEM_DIR, REQ_FILE, TEST_PLAN_FILE } = vars;

                            return `
The test plan was not created at @${TEST_PLAN_FILE}.

Create it now at that exact path. Match the requirements in @${REQ_FILE}.
Do not edit @${BACKLOG_ITEM_DIR}/desc.yml nor @${REQ_FILE}.

Verification output:
${prevValidateCommandResult ?? '(no output captured)'}
                            `.trim();
                        },
                    },
                ],
            }),
        },
        testImpl: {
            completion: 'keepPending',
            steps: [
                {
                    promptFn({ context: ctx }) {
                        const vars = ctx.variables as FeatureBacklogContextVariables;
                        const { BACKLOG_ITEM_DIR, TASK_NAME, TASK, REQ_FILE, TEST_PLAN_FILE } = vars;

                        return `
Write a test implementation for the following backlog item from @${BACKLOG_ITEM_DIR}/desc.yml.

The new tests should be skipped in order to not break the whole test suite.

Task name: ${TASK_NAME}
Task:
${TASK}

Follow the test plan in @${TEST_PLAN_FILE}.
The requirements for this task are in @${REQ_FILE}.
                        `.trim();
                    },
                },
            ],
        },
        implementation: {
            completion: 'moveToDone',
            steps: retryUntilGreen<CursorPresetLumpVariables, CursorPresetStepVariables>({
                steps: [
                    {
                        promptFn({ context: ctx }) {
                            const vars = ctx.variables as FeatureBacklogContextVariables;
                            const { REQ_FILE, TEST_PLAN_FILE } = vars;

                            return `
Implement the feature described in @${REQ_FILE}.
The tests have already been implemented according to the test plan in @${TEST_PLAN_FILE}.
Unskip all the tests that were skipped in the tests implementation.
The implementation should make the tests pass. Do not edit any test file except to unskip them or if absolutely necessary.
                            `.trim();
                        },
                    },
                ],
                validationCommandFn: runImplValidation,
            }),
        },
    },
});
