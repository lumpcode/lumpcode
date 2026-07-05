import { defineConfig } from '@lumpcode/cli-types';

export default defineConfig({
    getContextListFn: async () => {
        const date = Date.now().toString();
        return [
            {
                name: date,
                variables: {
                    DATE: date,
                },
            }
        ]
    },
    command: 'cursor',
    lumpVariables: {
        model: 'composer-2.5'
    },
    steps: [
        {
            promptFn() {
                return `
                    Look at all the files in @packages/apps/cli. Find one abstraction you can do to reduce repetitions in the code. Apply the abstraction.
                    Write an explanation of the abstraction you applied in .lumpcode/lumps/findAbstraction/NAME_OF_THE_ABSTRACTION.abstraction.md.
                `
            },
        },
    ],
    keepHistory: true,
    verbose: true,
    disabled: false,
    numberOfContextsPerBranch: 1,
    maximumNumberOfConcurrentBranches: 1,
    discoveryBranch: 'dev',
})