import { access } from 'node:fs/promises';
import path from 'node:path';

import {
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import {
    defaultImplPrompt,
    defaultTestImplPrompt,
    featureBacklog,
    projectRootFromConfigUrl,
    type FeatureBacklogPromptInput,
} from '@lumpcode/recipes';

import { learningsPrompts } from '../../helpers/learningsPrompts';
import { defineLump } from '../../templates/main';

const projectRoot = projectRootFromConfigUrl(import.meta.url);

async function existingExpectPath(itemDir: string): Promise<string | undefined> {
    if (!itemDir) {
        return undefined;
    }
    const relativePath = `${itemDir}/expect.yml`;
    try {
        await access(path.join(projectRoot, relativePath));
        return relativePath;
    } catch {
        return undefined;
    }
}

type BacklogPrompt = (
    input: FeatureBacklogPromptInput<CursorPresetLumpVariables>,
) => Promise<string>;

function stagePrompt(promptFn: typeof defaultTestImplPrompt): BacklogPrompt {
    return (input) => Promise.resolve(promptFn({
        ...input,
        stepIndex: 0,
        contextRunState: {},
    }));
}

async function withExpectMatch(base: BacklogPrompt, input: FeatureBacklogPromptInput<CursorPresetLumpVariables>) {
    const prompt = await base(input);
    const expectPath = await existingExpectPath(
        String(input.context.variables.BACKLOG_ITEM_DIR ?? ''),
    );
    if (!expectPath) {
        return prompt;
    }
    return `${prompt}

Read @${expectPath} and try to match that expectation if possible: prefer the listed files and stay close to the line estimates.`;
}

export default defineLump(featureBacklog<
    CursorPresetLumpVariables,
    CursorPresetStepVariables
>({
    configUrl: import.meta.url,
    registerCommands: ['cursor'],
    maximumNumberOfConcurrentBranches: 3,
    verbose: true,
    keepHistory: true,
    implValidateCommand: [
        'npm run build',
        'npm run check-types',
        'npm run test -w=@lumpcode/cli',
    ].join(' && '),
    prompts: learningsPrompts({
        testImpl: (input) => withExpectMatch(stagePrompt(defaultTestImplPrompt), input),
        impl: (input) => withExpectMatch(stagePrompt(defaultImplPrompt), input),
    }),
    timeoutMillis: 1000 * 60 * 60 * 4, // 4 hours
}));
