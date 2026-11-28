import type { Context, LumpVariables, PromptFn } from '@lumpcode/cli-utils';
import {
    defaultDirectImplPrompt,
    defaultImplPrompt,
    defaultReqPrompt,
    defaultTestImplPrompt,
    defaultTestPlanPrompt,
    type FeatureBacklogPromptInput,
    type FeatureBacklogPrompts,
} from '@lumpcode/recipes';

type Stage = keyof FeatureBacklogPrompts;

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

function asWorkflowPrompt<V extends LumpVariables>(
    promptFn: PromptFn<V>,
): (input: FeatureBacklogPromptInput<V>) => Promise<string> {
    return (input) => Promise.resolve(promptFn({
        context: input.context,
        lumpVariables: input.lumpVariables,
        stepIndex: 0,
        contextRunState: {},
    }));
}

/** Appends the capture-learnings instruction to a stage prompt. */
export function withLearnings<V extends LumpVariables = LumpVariables>(
    prompt: NonNullable<FeatureBacklogPrompts<V>[Stage]>,
): (input: FeatureBacklogPromptInput<V>) => Promise<string> {
    return async (input) => {
        const body = typeof prompt === 'string' ? prompt : await prompt(input);
        return `${body}\n\n${learningsAddendum(input.context)}`;
    };
}

/**
 * `featureBacklog` `prompts` where every stage also writes the item's learnings.md.
 * `overrides` replace a stage's default prompt before the learnings instruction is appended.
 */
export function learningsPrompts<V extends LumpVariables = LumpVariables>(
    overrides: Partial<{ [K in Stage]: NonNullable<FeatureBacklogPrompts<V>[K]> }> = {},
): FeatureBacklogPrompts<V> {
    return {
        req: withLearnings(overrides.req ?? asWorkflowPrompt(defaultReqPrompt)),
        testPlan: withLearnings(overrides.testPlan ?? asWorkflowPrompt(defaultTestPlanPrompt)),
        testImpl: withLearnings(overrides.testImpl ?? asWorkflowPrompt(defaultTestImplPrompt)),
        impl: withLearnings(overrides.impl ?? asWorkflowPrompt(defaultImplPrompt)),
        directImpl: withLearnings(overrides.directImpl ?? asWorkflowPrompt(defaultDirectImplPrompt)),
    };
}
