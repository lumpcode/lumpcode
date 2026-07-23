import { LumpJsConfig } from '@lumpcode/cli-types';
import { abstractionFinder } from '@lumpcode/recipes';

export default {
    ...abstractionFinder({
        maxPendingAbstractions: 5,
        scanDirectories: ['packages/apps/cli'],
        backlogItemsDir: '.lumpcode/lumps/abstractionImplementer/backlogItems',
        command: 'cursor',
        lumpVariables: { model: 'cursor-grok-4.5-high-fast' },
        discoveryBranch: 'dev',
    }),
} satisfies LumpJsConfig;
