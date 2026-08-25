import fs from 'node:fs/promises';
import path from 'node:path';

import {
    getContextStatus,
    type LumpJsConfig,
    type LumpVariables,
    type StepVariables,
} from '@lumpcode/cli-utils';
import { pathExists } from '@lumpcode/core';
import { load as loadYaml } from 'js-yaml';

import {
    projectRootFromConfigUrl,
    requireArtifactStep,
    resolveImplValidateCommand,
    retryUntilGreen,
    type BacklogPaths,
    type ValidationCommandFn,
} from '../../kit';
import { defineRecipe, type BaseBacklogItem } from '../../types';
import {
    backlog,
    type BacklogItemResolution,
} from '../backlog';

export type FeatureBacklogWorkflow = 'tdd' | 'directImpl' | 'manual';
export type FeatureBacklogRunnableWorkflow = Exclude<FeatureBacklogWorkflow, 'manual'>;

export type FeatureBacklogItem = BaseBacklogItem & {
    manualReq?: boolean;
    workflow?: FeatureBacklogWorkflow;
    completedAt?: string;
    /** Path relative to `backlogItems/todo/`; tickets live at `<parent>/tickets/<name>`. */
    todoRelativeDir: string;
    /** Parent todo folder name when this item is a ticket. */
    parentName?: string;
};

export type FeatureBacklogStage =
    | 'makeReq'
    | 'makeTestPlan'
    | 'testImpl'
    | 'implementation'
    | 'directImpl';

export type FeatureBacklogContextVariables = {
    TASK_NAME: string;
    TASK: string;
    BACKLOG_ITEMS_DIR: string;
    BACKLOG_ITEM_DIR: string;
    BACKLOG_STAGE: FeatureBacklogStage;
    REQ_FILE?: string;
    TEST_PLAN_FILE?: string;
};

export type FeatureBacklogOptions<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    configUrl: string | URL;
    implValidateCommand?: ValidationCommandFn<V, SV> | string;
    backlogItemsDir?: string;
} & Omit<
    LumpJsConfig<V, SV>,
    'contextListJson' | 'contextMatchFn' | 'getContextListFn' | 'prompt' | 'steps'
>;

export const FEATURE_BACKLOG_WORKFLOWS = [
    'tdd',
    'directImpl',
    'manual',
] as const satisfies readonly FeatureBacklogWorkflow[];

const RESERVED_NAME_SUFFIXES = ['_req', '_testPlan', '_tests_impl'] as const;

function assertValidFeatureItemName(name: string): void {
    for (const suffix of RESERVED_NAME_SUFFIXES) {
        if (name.endsWith(suffix)) {
            throw new Error(`Backlog item name must not end with reserved suffix ${suffix}: ${name}`);
        }
    }
}

function featureItemContextBaseName(item: Pick<FeatureBacklogItem, 'name' | 'parentName'>): string {
    return item.parentName ? `${item.parentName}-${item.name}` : item.name;
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
        case 'directImpl':
            return itemName;
        default: {
            const _exhaustive: never = stage;
            return _exhaustive;
        }
    }
}

function parentNameFromTodoRelativeDir(todoRelativeDir: string): string | undefined {
    const parts = todoRelativeDir.split('/');
    if (parts.length === 3 && parts[1] === 'tickets') {
        return parts[0];
    }
    return undefined;
}

export function parseFeatureWorkflow(itemName: string, raw: unknown): FeatureBacklogWorkflow | undefined {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return undefined;
    }
    const record = raw as Record<string, unknown>;
    if (record.workflow === undefined) {
        return undefined;
    }
    if (
        typeof record.workflow !== 'string' ||
        !(FEATURE_BACKLOG_WORKFLOWS as readonly string[]).includes(record.workflow)
    ) {
        throw new Error(
            `Backlog item "${itemName}" field "workflow" must be one of: ${FEATURE_BACKLOG_WORKFLOWS.join(', ')}`,
        );
    }
    return record.workflow as FeatureBacklogWorkflow;
}

async function resolveItemWorkflow(input: {
    item: FeatureBacklogItem;
    paths: BacklogPaths;
    projectRoot: string;
}): Promise<FeatureBacklogWorkflow> {
    const { item, paths, projectRoot } = input;
    if (item.workflow !== undefined) {
        return item.workflow;
    }
    if (item.parentName === undefined) {
        return 'tdd';
    }

    const parentDescPath = path.join(
        projectRoot,
        paths.backlogItemsDir,
        'todo',
        item.parentName,
        'desc.yml',
    );
    let rawText: string;
    try {
        rawText = await fs.readFile(parentDescPath, 'utf-8');
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
            return 'tdd';
        }
        throw error;
    }

    return parseFeatureWorkflow(item.parentName, loadYaml(rawText)) ?? 'tdd';
}

/**
 * `dev` → only top-level `directImpl` (tickets never run on `dev`, even if `directImpl`).
 * `feature/<key>` → exact item name, or the parent todo name for tickets.
 * `manual` never reaches here (`resolveFeatureBacklogItem` ignores it first).
 */
function itemMatchesDiscoveryBranch(input: {
    itemName: string;
    parentName?: string;
    discoveryBranch: string;
    workflow: FeatureBacklogRunnableWorkflow;
}): boolean {
    const { itemName, parentName, discoveryBranch, workflow } = input;
    if (discoveryBranch === 'dev') {
        return workflow === 'directImpl' && parentName === undefined;
    }
    if (!discoveryBranch.startsWith('feature/')) {
        return false;
    }
    const key = discoveryBranch.slice('feature/'.length);
    return (parentName ?? itemName) === key;
}

export async function resolveFeatureBacklogItem(input: {
    item: FeatureBacklogItem;
    paths: BacklogPaths;
    projectRoot: string;
    discoveryBranch: string;
}): Promise<BacklogItemResolution<FeatureBacklogStage>> {
    const { item, paths, projectRoot, discoveryBranch } = input;
    const contextBaseName = featureItemContextBaseName(item);
    const workflow = await resolveItemWorkflow({ item, paths, projectRoot });

    if (workflow === 'manual') {
        return { ignored: true };
    }

    if (
        !!item.completedAt ||
        !itemMatchesDiscoveryBranch({
            itemName: item.name,
            parentName: item.parentName,
            discoveryBranch,
            workflow,
        })
    ) {
        return { ignored: true };
    }

    const itemDir = path.join(paths.backlogItemsDir, 'todo', item.todoRelativeDir);
    const reqFilePath = path.join(itemDir, 'requirements.md');
    const testPlanFilePath = path.join(itemDir, 'testPlan.md');

    const hasReq = await pathExists(path.join(projectRoot, reqFilePath));

    if (!hasReq) {
        if (item.manualReq === true) {
            return { ignored: true };
        }

        return {
            stage: 'makeReq',
            contextName: featureContextName(contextBaseName, 'makeReq'),
            variables: { REQ_FILE: reqFilePath },
        };
    }

    if (workflow === 'directImpl') {
        return {
            stage: 'directImpl',
            contextName: featureContextName(contextBaseName, 'directImpl'),
            variables: { REQ_FILE: reqFilePath },
        };
    }

    const hasTestPlan = await pathExists(path.join(projectRoot, testPlanFilePath));
    if (!hasTestPlan) {
        return {
            stage: 'makeTestPlan',
            contextName: featureContextName(contextBaseName, 'makeTestPlan'),
            variables: {
                REQ_FILE: reqFilePath,
                TEST_PLAN_FILE: testPlanFilePath,
            },
        };
    }

    const testsImplContextName = featureContextName(contextBaseName, 'testImpl');
    const testsImplStatus = await getContextStatus({
        projectRoot,
        contextName: testsImplContextName,
        lumpName: paths.lumpName,
        baseBranch: discoveryBranch,
    });

    if (testsImplStatus === 'finished') {
        return {
            stage: 'implementation',
            contextName: featureContextName(contextBaseName, 'implementation'),
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

export const featureBacklog = defineRecipe(function featureBacklog<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(options: FeatureBacklogOptions<V, SV>): LumpJsConfig<V, SV> {
    const {
        configUrl,
        implValidateCommand,
        backlogItemsDir,
        ...rest
    } = options;

    const projectRoot = projectRootFromConfigUrl(configUrl);
    const runImplValidation = resolveImplValidateCommand<V, SV>(
        implValidateCommand ??
            'echo "No implementation validation command provided. I say, trust but verify, but well..."',
    );

    return backlog<FeatureBacklogItem, V, SV>({
        configUrl,
        backlogItemsDir,
        parseItem(baseItem, folderName, raw) {
            assertValidFeatureItemName(baseItem.name);
            const record = raw as Record<string, unknown>;
            if (record.manualReq !== undefined && typeof record.manualReq !== 'boolean') {
                throw new Error(`Backlog item "${baseItem.name}" field "manualReq" must be a boolean`);
            }
            const parentName = parentNameFromTodoRelativeDir(folderName);
            return {
                ...baseItem,
                todoRelativeDir: folderName,
                parentName,
                dependsOn: parentName
                    ? baseItem.dependsOn?.map((dep) => `${parentName}-${dep}`)
                    : baseItem.dependsOn,
                manualReq: record.manualReq === true ? true : undefined,
                workflow: parseFeatureWorkflow(baseItem.name, raw),
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
                steps: retryUntilGreen<V, SV>({
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
                    validationCommandFn: requireArtifactStep<V, SV>('REQ_FILE'),
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
                steps: retryUntilGreen<V, SV>({
                    steps: [
                        {
                            promptFn({ context: ctx }) {
                                const vars = ctx.variables as FeatureBacklogContextVariables;
                                const { BACKLOG_ITEM_DIR, TASK_NAME, TASK, REQ_FILE, TEST_PLAN_FILE } = vars;

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
                    validationCommandFn: requireArtifactStep<V, SV>('TEST_PLAN_FILE'),
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
                steps: retryUntilGreen<V, SV>({
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
            directImpl: {
                completion: 'moveToDone',
                steps: retryUntilGreen<V, SV>({
                    steps: [
                        {
                            promptFn({ context: ctx }) {
                                const vars = ctx.variables as FeatureBacklogContextVariables;
                                const { REQ_FILE } = vars;

                                return `
Implement the feature described in @${REQ_FILE}.
Add or update tests as needed so the suite covers the change, and make validation pass.
Do not edit @${REQ_FILE} unless absolutely necessary.
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
