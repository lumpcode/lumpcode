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
    openPrPostTeardown,
    projectRootFromConfigUrl,
} from '@lumpcode/recipes';

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

async function withExpectMatch(
    base: typeof defaultTestImplPrompt,
    input: Parameters<typeof defaultTestImplPrompt>[0],
) {
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

export default featureBacklog<
    CursorPresetLumpVariables,
    CursorPresetStepVariables
>({
    configUrl: import.meta.url,
    command: 'cursor',
    registerCommands: ['cursor'],
    maximumNumberOfConcurrentBranches: 3,
    verbose: true,
    keepHistory: true,
    lumpVariables: { model: 'cursor-grok-4.6-high' },
    implValidateCommand: [
        'npm run build -w=@lumpcode/cli',
        'npm run test -w=@lumpcode/cli',
    ].join(' && '),
    postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
    promptFns: {
        testImpl: (input) => withExpectMatch(defaultTestImplPrompt, input),
        impl: (input) => withExpectMatch(defaultImplPrompt, input),
    },
    timeoutMillis: 1000 * 60 * 60 * 4, // 4 hours
});
