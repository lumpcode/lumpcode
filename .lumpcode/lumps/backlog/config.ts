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

async function existingBlastPath(itemDir: string): Promise<string | undefined> {
    if (!itemDir) {
        return undefined;
    }
    const relativePath = `${itemDir}/blast.yml`;
    try {
        await access(path.join(projectRoot, relativePath));
        return relativePath;
    } catch {
        return undefined;
    }
}

async function withBlastMatch(
    base: typeof defaultTestImplPrompt,
    input: Parameters<typeof defaultTestImplPrompt>[0],
) {
    const prompt = await base(input);
    const blastPath = await existingBlastPath(
        String(input.context.variables.BACKLOG_ITEM_DIR ?? ''),
    );
    if (!blastPath) {
        return prompt;
    }
    return `${prompt}

Read @${blastPath} and try to match that blast if possible: prefer the listed files and stay close to the line estimates.`;
}

export default featureBacklog<
    CursorPresetLumpVariables,
    CursorPresetStepVariables
>({
    configUrl: import.meta.url,
    command: 'cursor',
    registerCommands: ['cursor'],
    maximumNumberOfConcurrentBranches: 2,
    verbose: true,
    keepHistory: true,
    lumpVariables: { model: 'cursor-grok-4.6-high-fast' },
    implValidateCommand: [
        'npm run build -w=@lumpcode/cli',
        'npm run test -w=@lumpcode/cli',
    ].join(' && '),
    postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
    promptFns: {
        testImpl: (input) => withBlastMatch(defaultTestImplPrompt, input),
        impl: (input) => withBlastMatch(defaultImplPrompt, input),
    },
});
