import { LumpJsConfig } from '@lumpcode/cli-types';
import { abstractionBacklog } from '@lumpcode/recipes';

export default {
    ...abstractionBacklog({
        lumpName: 'abstractionImplementer',
        baseBranch: 'dev',
    }),
    discoveryBranch: 'dev',
} satisfies LumpJsConfig;
