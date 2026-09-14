import { LumpJsConfig } from '@lumpcode/cli-utils';
import { CursorPresetLumpVariables, CursorPresetStepVariables } from '@lumpcode/cli-utils';
import { abstractionBacklog, openPrPostTeardown } from '@lumpcode/recipes';

export default {
    ...abstractionBacklog<CursorPresetLumpVariables, CursorPresetStepVariables>({
        baseBranch: 'dev',
        command: 'cursor',
        configUrl: import.meta.url,
        registerCommands: ['cursor'],
        maximumNumberOfConcurrentBranches: 1,
        verbose: true,
        keepHistory: true,
        lumpVariables: { model: 'composer-2.5' },
        discoveryBranch: 'dev',
        postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
    }),
} satisfies LumpJsConfig<CursorPresetLumpVariables, CursorPresetStepVariables>;
