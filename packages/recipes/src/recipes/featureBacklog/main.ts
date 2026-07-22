import path from 'node:path';

import { getContextStatus, type LumpJsConfig } from '@lumpcode/cli-utils';
import { pathExists } from '@lumpcode/core';

import {
    projectRootFromConfigUrl,
    requireArtifactStep,
    resolveImplValidateCommand,
    retryUntilGreen,
    type BacklogPaths,
    type ValidationCommandFn,
} from '../../kit';
import { defineRecipe, type Recipe, type BaseBacklogItem } from '../../types';
import {
    backlog,
    type BacklogItemResolution,
} from '../backlog';

export type FeatureBacklogItem = BaseBacklogItem & {
    manualPrd?: boolean;
};

export type FeatureBacklogStage = 'makePrd' | 'makeTestPlan' | 'testImpl' | 'implementation';

export type FeatureBacklogContextVariables = {
    TASK_NAME: string;
    TASK: string;
    BACKLOG_ITEMS_DIR: string;
    BACKLOG_ITEM_DIR: string;
    BACKLOG_STAGE: FeatureBacklogStage;
    PRD_FILE?: string;
    TEST_PLAN_FILE?: string;
};

export type FeatureBacklogOptions = {
    configUrl: string | URL;
    baseBranch: string;
    implValidateCommand?: ValidationCommandFn | string;
    backlogItemsDir?: string;
} & Omit<
    LumpJsConfig,
    'contextListJson' | 'contextMatchFn' | 'getContextListFn' | 'prompt' | 'steps' | 'baseBranch'
>;

const RESERVED_NAME_SUFFIXES = ['_prd', '_testPlan', '_tests_impl'] as const;

function assertValidFeatureItemName(name: string): void {
    for (const suffix of RESERVED_NAME_SUFFIXES) {
        if (name.endsWith(suffix)) {
            throw new Error(`Backlog item name must not end with reserved suffix ${suffix}: ${name}`);
        }
    }
}

function featureContextName(itemName: string, stage: FeatureBacklogStage): string {
    switch (stage) {
        case 'makePrd':
            return `${itemName}_prd`;
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

export async function resolveFeatureBacklogItem(
    item: FeatureBacklogItem,
    paths: BacklogPaths,
    projectRoot: string,
    lumpName: string,
    baseBranch: string,
): Promise<BacklogItemResolution<FeatureBacklogStage>> {
    const prdFilePath = path.join(paths.backlogItemsDir, 'todo', item.name, 'prd.md');
    const testPlanFilePath = path.join(paths.backlogItemsDir, 'todo', item.name, 'testPlan.md');

    const hasPrd = await pathExists(path.join(projectRoot, prdFilePath));
    if (!hasPrd) {
        if (item.manualPrd === true) {
            return { ignored: true };
        }

        return {
            stage: 'makePrd',
            contextName: featureContextName(item.name, 'makePrd'),
            variables: { PRD_FILE: prdFilePath },
        };
    }

    const hasTestPlan = await pathExists(path.join(projectRoot, testPlanFilePath));
    if (!hasTestPlan) {
        return {
            stage: 'makeTestPlan',
            contextName: featureContextName(item.name, 'makeTestPlan'),
            variables: {
                PRD_FILE: prdFilePath,
                TEST_PLAN_FILE: testPlanFilePath,
            },
        };
    }

    const testsImplContextName = featureContextName(item.name, 'testImpl');
    const testsImplStatus = await getContextStatus({
        projectRoot,
        contextName: testsImplContextName,
        lumpName,
        baseBranch,
    });

    if (testsImplStatus === 'finished') {
        return {
            stage: 'implementation',
            contextName: featureContextName(item.name, 'implementation'),
            variables: {
                PRD_FILE: prdFilePath,
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
            PRD_FILE: prdFilePath,
            TEST_PLAN_FILE: testPlanFilePath,
        },
    };
}

export const featureBacklog: Recipe<FeatureBacklogOptions> = defineRecipe((options) => {
    const {
        configUrl,
        baseBranch,
        implValidateCommand,
        backlogItemsDir,
        ...rest
    } = options;

    const projectRoot = projectRootFromConfigUrl(configUrl);
    const runImplValidation = resolveImplValidateCommand(implValidateCommand ?? 'echo "No implementation validation command provided. I say, trust but verify, but well..."');

    return backlog({
        configUrl,
        backlogItemsDir,
        baseBranch,
        parseItem(baseItem, _folderName, raw) {
            assertValidFeatureItemName(baseItem.name);
            const record = raw as Record<string, unknown>;
            if (record.manualPrd !== undefined && typeof record.manualPrd !== 'boolean') {
                throw new Error(`Backlog item "${baseItem.name}" field "manualPrd" must be a boolean`);
            }
            return {
                ...baseItem,
                manualPrd: record.manualPrd === true ? true : undefined,
            };
        },
        async resolveItem({ item, paths }) {
            return resolveFeatureBacklogItem(
                item,
                paths,
                projectRoot,
                paths.lumpName,
                baseBranch,
            );
        },
        stages: {
            makePrd: {
                completion: 'keepPending',
                steps: [
                    {
                        promptFn({ context: ctx }) {
                            const vars = ctx.variables as FeatureBacklogContextVariables;
                            const { BACKLOG_ITEM_DIR, TASK_NAME, TASK, PRD_FILE } = vars;

                            return `
Write a product requirements document (PRD) for the following backlog item from @${BACKLOG_ITEM_DIR}/desc.yml.

Task name: ${TASK_NAME}

Task:
${TASK}

Save the PRD to @${PRD_FILE}. Do not edit @${BACKLOG_ITEM_DIR}/desc.yml.

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
                    requireArtifactStep('PRD_FILE'),
                ],
            },
            makeTestPlan: {
                completion: 'keepPending',
                steps: [
                    {
                        promptFn({ context: ctx }) {
                            const vars = ctx.variables as FeatureBacklogContextVariables;
                            const { BACKLOG_ITEM_DIR, TASK_NAME, TASK, PRD_FILE, TEST_PLAN_FILE } = vars;

                            return `
Write a test plan for the following backlog item from @${BACKLOG_ITEM_DIR}/desc.yml.

Task name: ${TASK_NAME}
Task:
${TASK}

The PRD for this task is @${PRD_FILE}. The test plan should match the requirements of the PRD.

Save the test plan to @${TEST_PLAN_FILE}. Do not edit @${BACKLOG_ITEM_DIR}/desc.yml nor @${PRD_FILE}.

The test plan should be self-contained and implementation-ready. Include:
- Test cases
- Test data
- Test expectations
- Test implementation details
                            `.trim();
                        },
                    },
                    requireArtifactStep('TEST_PLAN_FILE'),
                ],
            },
            testImpl: {
                completion: 'keepPending',
                steps: [
                    {
                        promptFn({ context: ctx }) {
                            const vars = ctx.variables as FeatureBacklogContextVariables;
                            const { BACKLOG_ITEM_DIR, TASK_NAME, TASK, PRD_FILE, TEST_PLAN_FILE } = vars;

                            return `
Write a test implementation for the following backlog item from @${BACKLOG_ITEM_DIR}/desc.yml.

Task name: ${TASK_NAME}
Task:
${TASK}

Follow the test plan in @${TEST_PLAN_FILE}.
The PRD for this task is @${PRD_FILE}.
                            `.trim();
                        },
                    },
                ],
            },
            implementation: {
                completion: 'moveToDone',
                steps: retryUntilGreen({
                    steps: [
                        {
                            promptFn({ context: ctx }) {
                                const vars = ctx.variables as FeatureBacklogContextVariables;
                                const { PRD_FILE, TEST_PLAN_FILE } = vars;

                                return `
Implement the feature described in @${PRD_FILE}.
The tests have already been implemented according to the test plan in @${TEST_PLAN_FILE}.
The implementation should make the tests pass. Do not edit any test file.
                                `.trim();
                            },
                        },
                    ],
                    validationCommandFn: runImplValidation,
                }),
            },
        },
        ...rest,
    });
});
