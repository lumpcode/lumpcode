import { LumpJsConfig } from '@lumpcode/cli-types';
import { abstractionFinder } from '@lumpcode/recipes';

export default {
    ...abstractionFinder({
        maxPendingAbstractions: 5,
        scanDirectories: ['packages/apps/cli'],
        backlogItemsDir: '.lumpcode/lumps/abstractionImplementer/backlogItems',
        command: 'cursor',
        lumpVariables: { model: 'composer-2.5' },
        discoveryBranch: 'dev',
    }),
} satisfies LumpJsConfig;
