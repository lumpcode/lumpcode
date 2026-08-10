import { LumpJsConfig } from '@lumpcode/cli-utils';
import { CursorPresetLumpVariables, CursorPresetStepVariables } from '@lumpcode/cli-utils';
import { abstractionFinder } from '@lumpcode/recipes';

const scanDirectories = ['packages/apps/cli'];
const backlogItemsDir = '.lumpcode/lumps/abstractionImplementer/backlogItems';

export default {
    ...abstractionFinder<CursorPresetLumpVariables, CursorPresetStepVariables>({
        maxPendingAbstractions: 5,
        scanDirectories,
        backlogItemsDir,
        command: 'cursor',
        lumpVariables: { model: 'cursor-grok-4.5-high-fast' },
        discoveryBranch: 'dev',
        maximumNumberOfConcurrentBranches: 1,
    }),
    steps: ([
        {
          commandFn() {
            return {
              executable: "sh",
              args: [
                "-c",
                "npx fallow dupes -w @lumpcode/cli --mode semantic --format json > packages/apps/cli/cli.dupes.json < /dev/null"
              ]
            };
          }
        },
        {
          promptFn() {
            return `
              /find-cli-abstractions in file mode, the backlogItemsDir is @${backlogItemsDir}
              You can use @packages/apps/cli/cli.dupes.json to help you find repetitions.
            `;         
          }
        }
      ]) satisfies LumpJsConfig["steps"],
} satisfies LumpJsConfig<CursorPresetLumpVariables, CursorPresetStepVariables>;
