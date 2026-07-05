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
        lumpVariables: { model: 'composer-2.5' },
        discoveryBranch: 'dev',
        implValidateCommand: [
            'npm run build -w=@lumpcode/cli',
            'npm run test -w=@lumpcode/cli',
        ].join(' && '),
    }),
} satisfies LumpJsConfig;
