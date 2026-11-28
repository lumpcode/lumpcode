import { LumpJsConfig } from '@lumpcode/cli-utils';
import { CursorPresetLumpVariables, CursorPresetStepVariables } from '@lumpcode/cli-utils';
import { abstractionBacklogSteps, openPrPostTeardown } from '@lumpcode/recipes';

export default {
    ...abstractionBacklogSteps<CursorPresetLumpVariables, CursorPresetStepVariables>({
        baseBranch: 'dev',
        command: 'cursor',
        configUrl: import.meta.url,
        registerCommands: ['cursor'],
        maximumNumberOfConcurrentBranches: 1,
        verbose: true,
        keepHistory: true,
        lumpVariables: { model: 'grok-4.7-high' },
        discoveryBranch: 'dev',
        postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
    }),
} satisfies LumpJsConfig<CursorPresetLumpVariables, CursorPresetStepVariables>;
