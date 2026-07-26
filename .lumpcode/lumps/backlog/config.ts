import { LumpJsConfig } from '@lumpcode/cli-types';
import { featureBacklog } from '@lumpcode/recipes';

export default {
    ...featureBacklog({
        baseBranch: 'dev',
        command: 'cursor',
        configUrl: import.meta.url,
        registerCommands: ['cursor'],
        maximumNumberOfConcurrentBranches: 5,
        verbose: true,
        keepHistory: true,
        lumpVariables: { model: 'cursor-grok-4.5-high-fast' },
        discoveryBranch: 'dev',
        implValidateCommand: [
            'npm run build -w=@lumpcode/cli',
            'npm run test -w=@lumpcode/cli',
        ].join(' && '),
    }),
} satisfies LumpJsConfig;