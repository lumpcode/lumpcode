import { LumpJsConfig } from '@lumpcode/cli-types';
import { abstractionBacklog } from '@lumpcode/recipes';

export default {
    ...abstractionBacklog({
        baseBranch: 'dev',
        command: 'cursor',
        configUrl: import.meta.url,
        registerCommands: ['cursor'],
        maximumNumberOfConcurrentBranches: 3,
        verbose: true,
        keepHistory: true,
        lumpVariables: { model: 'cursor-grok-4.5-high-fast' },
        discoveryBranch: 'dev',
    }),
} satisfies LumpJsConfig;
