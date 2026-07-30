import { LumpJsConfig } from '@lumpcode/cli-utils';
import { CursorPresetLumpVariables, CursorPresetStepVariables } from '@lumpcode/cli-utils';
import { abstractionFinder } from '@lumpcode/recipes';

export default {
    ...abstractionFinder<CursorPresetLumpVariables, CursorPresetStepVariables>({
        maxPendingAbstractions: 5,
        scanDirectories: ['packages/apps/cli'],
        backlogItemsDir: '.lumpcode/lumps/abstractionImplementer/backlogItems',
        command: 'cursor',
        lumpVariables: { model: 'cursor-grok-4.5-high-fast' },
        discoveryBranch: 'dev',
        maximumNumberOfConcurrentBranches: 1,
    }),
} satisfies LumpJsConfig<CursorPresetLumpVariables, CursorPresetStepVariables>;
