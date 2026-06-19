import fs from 'fs/promises';
import { defineConfig } from '@lumpcode/cli-types';

export default defineConfig({
    command: "cursor",
    // command({ context, prompt }) {
    //     console.log('context', context);
    //     console.log('prompt', prompt);
    //     return {
    //         executable: "touch",
    //         args: [`${context.variables.COMMAND}_ZOZO.ts`],
    //     }
    // },
    // contextListJson: {
    //     DESC: "packages/apps/cli/__TASKS/cliCommands/{COMMAND}.desc.md",
    // },
    async contextMatchFn({ codeBasePath }) {
        const { isDir, path } = codeBasePath;
        if (isDir || !path.endsWith('.desc.md')) {
            return null;
        }
        const command = path.split('/').pop().split('.')[0];
        const priorityJsonStr = await fs.readFile(`.lumpcode/lumps/cliCommands/__TASKS/priority.json`, 'utf-8');
        const priorityJson = JSON.parse(priorityJsonStr);
        const priority = priorityJson[command].priority;
        const dependsOn = priorityJson[command].dependsOn;

        return {
            contextName: command,
            filePathVariableName: "COMMAND_DESC_FILE",
            contextOptions: {
                priority,
                dependsOnContexts: dependsOn,
            }
        }
    },
    steps: [
        {
            promptFn({ context }) {
                const commandDescFile = context.variables.COMMAND_DESC_FILE;
                return `
                Implement the following command for lumpcode, following the description in this file @${commandDescFile}

                Note : Take example for the architecture on the run command located at : @packages/apps/cli/src/commands
                `;
            },
        },
    ],
    disabled: true,
    numberOfContextsPerBranch: 1,
    maximumNumberOfConcurrentBranches: 2,
    verbose: true,
});