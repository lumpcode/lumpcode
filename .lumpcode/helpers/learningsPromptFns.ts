import {
    type Context,
    type LumpVariables,
    type PromptFn,
    type StepVariables,
} from '@lumpcode/cli-utils';
import {
    defaultDirectImplPrompt,
    defaultImplPrompt,
    defaultReqPrompt,
    defaultTestImplPrompt,
    defaultTestPlanPrompt,
    type FeatureBacklogPromptFns,
} from '@lumpcode/recipes';

type Stage = keyof FeatureBacklogPromptFns;

function contextVariable(context: Context, key: string): string {
    const value = context.variables[key];
    return typeof value === 'string' ? value : '';
}

function stageLanded(stage: string): string {
    switch (stage) {
        case 'req':
            return 'Landed is the requirements document this stage wrote.';
        case 'testPlan':
            return 'Landed is the test plan this stage wrote.';
        case 'testImpl':
            return 'Landed is the skipped tests this stage added.';
        case 'impl':
        case 'directImpl':
            return 'Landed is the working-tree change that implements the item.';
        default:
            return 'Landed is the files this stage changed.';
    }
}

function learningsAddendum(context: Context): string {
    const itemDir = contextVariable(context, 'BACKLOG_ITEM_DIR');
    const stage = contextVariable(context, 'BACKLOG_STAGE');
    return [
        'When that work is done, read @.agents/skills/capture-learnings/SKILL.md and follow it.',
        '',
        `Write or update @${itemDir}/learnings.md for this ${stage} stage. That file is part of the stage, along with the work above.`,
        '',
        stageLanded(stage),
        'The marker commit for this stage does not exist yet. Name the files this stage changed. Do not invent a commit hash.',
        'The expectation is this item\'s desc.yml, requirements.md, testPlan.md, and expect.yml when they exist. Use the parent item\'s copy when this item has none.',
        'If learnings.md already exists, update it in place and keep what earlier stages recorded.',
        'Omit Gap when this stage matches what was asked. Omit Adjustments when nothing changed the expectation.',
    ].join('\n');
}

/** Appends the capture-learnings instruction to a stage prompt. */
export function withLearnings<V extends LumpVariables = LumpVariables, SV extends StepVariables = StepVariables>(
    promptFn: PromptFn<V, SV>,
): PromptFn<V, SV> {
    return async (input) => {
        const body = await promptFn(input);
        return `${body}\n\n${learningsAddendum(input.context)}`;
    };
}

/**
 * `featureBacklog` `promptFns` where every stage also writes the item's learnings.md.
 * `overrides` replace a stage's default prompt before the learnings instruction is appended.
 */
export function learningsPromptFns<V extends LumpVariables = LumpVariables, SV extends StepVariables = StepVariables>(
    overrides: Partial<Record<Stage, PromptFn<V, SV>>> = {},
): FeatureBacklogPromptFns<V, SV> {
    return {
        req: withLearnings(overrides.req ?? defaultReqPrompt),
        testPlan: withLearnings(overrides.testPlan ?? defaultTestPlanPrompt),
        testImpl: withLearnings(overrides.testImpl ?? defaultTestImplPrompt),
        impl: withLearnings(overrides.impl ?? defaultImplPrompt),
        directImpl: withLearnings(overrides.directImpl ?? defaultDirectImplPrompt),
    };
}
