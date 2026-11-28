import {
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import { featureBacklogSteps } from '@lumpcode/recipes';

import { learningsPromptFns } from '../../helpers/learningsPromptFns';
import { defineLump } from '../../templates/main';

export default defineLump(featureBacklogSteps<
    CursorPresetLumpVariables,
    CursorPresetStepVariables
>({
    configUrl: import.meta.url,
    registerCommands: ['cursor'],
    maximumNumberOfConcurrentBranches: 2,
    verbose: true,
    keepHistory: true,
    implValidateCommand: [
        'npm run build',
        'npm run check-types',
        'npm run test -w=@lumpcode/cli',
    ].join(' && '),
    promptFns: learningsPromptFns(),
}));
