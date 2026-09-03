import {
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import { featureBacklog, openPrPostTeardown } from '@lumpcode/recipes';

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
    lumpVariables: { model: 'cursor-grok-4.5-high-fast' },
    discoveryBranches: ['dev', 'feature/*'],
    implValidateCommand: [
        'npm run build -w=@lumpcode/cli',
        'npm run test -w=@lumpcode/cli',
    ].join(' && '),
    postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
});
