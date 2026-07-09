import { LumpJsConfig } from '@lumpcode/cli-types';
import { abstractionFinder } from '@lumpcode/recipes';

export default {
    ...abstractionFinder({
        maxPendingAbstractions: 5,
        scanDirectories: ['packages/apps/cli'],
        backlogFilePath: '.lumpcode/lumps/abstractionImplementer/BACKLOG.yml',
        doneFilePath: '.lumpcode/lumps/abstractionImplementer/DONE.yml',
        prdDirPath: '.lumpcode/lumps/abstractionImplementer/prds',
        command: 'cursor',
        lumpVariables: { model: 'composer-2.5' },
        discoveryBranch: 'dev',
    }),
} satisfies LumpJsConfig;
