import {
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import { featureBacklog } from '@lumpcode/recipes';

import { learningsPromptFns } from '../../helpers/learningsPromptFns';
import { defineLump } from '../../templates/main';

export default defineLump(featureBacklog<
    CursorPresetLumpVariables,
    CursorPresetStepVariables
>({
    configUrl: import.meta.url,
    registerCommands: ['cursor'],
    maximumNumberOfConcurrentBranches: 2,
    verbose: true,
    keepHistory: true,
    implValidateCommand: [
        'npm run build -w=@lumpcode/cli',
        'npm run test -w=@lumpcode/cli',
    ].join(' && '),
    promptFns: learningsPromptFns(),
}));
