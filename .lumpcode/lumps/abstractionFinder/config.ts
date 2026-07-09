import { LumpJsConfig } from '@lumpcode/cli-types';
import { abstractionFinder } from '@lumpcode/recipes';

export default {
    ...abstractionFinder({
        implementerLumpName: 'abstractionImplementer',
        maxPendingAbstractions: 5,
        scanDirectories: ['packages/apps/cli'],
        command: 'cursor',
        lumpVariables: { model: 'composer-2.5' },
    }),
    discoveryBranch: 'dev',
} satisfies LumpJsConfig;
