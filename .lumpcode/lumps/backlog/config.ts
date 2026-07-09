import { LumpJsConfig } from '@lumpcode/cli-types';
import { backlog } from '@lumpcode/recipes';

export default {
    ...backlog({
        lumpName: 'backlog',
        baseBranch: 'dev',
    }),
    discoveryBranch: 'dev',
} satisfies LumpJsConfig;
