import {
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import { abstractionFinder } from '@lumpcode/recipes';

const scanDirectories = ['packages/apps/cli'];
const backlogItemsDir = '.lumpcode/lumps/abstractionImplementer/backlogItems';

export default abstractionFinder<CursorPresetLumpVariables, CursorPresetStepVariables>({
    configUrl: import.meta.url,
    maxPendingAbstractions: 1,
    scanDirectories,
    backlogItemsDir,
    command: 'cursor',
    lumpVariables: { model: 'cursor-grok-4.5-high-fast' },
    discoveryBranch: 'dev',
    maximumNumberOfConcurrentBranches: 1,
    scanCommand:
        'npx fallow dupes -w @lumpcode/cli --mode semantic --format json > packages/apps/cli/cli.dupes.json < /dev/null',
    steps: [
        {
            promptFn() {
                return `
/find-cli-abstractions in file mode, the backlogItemsDir is @${backlogItemsDir}
You can use @packages/apps/cli/cli.dupes.json to help you find repetitions.
                `.trim();
            },
        },
    ],
});
