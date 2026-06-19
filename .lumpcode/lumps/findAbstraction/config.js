import { defineConfig } from '@lumpcode/cli-types';

export default defineConfig({
    getContextListFn: async () => {
        const name = Date.now().toString();
        return [
            {
                name,
                variables: {
                    NAME: name,
                },
            }
        ]
    },
    command: 'cursor',
    steps: [
        {
            promptFn() {
                return `
                    Look at all the files in @packages/apps/cli. Find one abstraction you can do to reduce repetitions in the code. Apply the abstraction.
                    Write an explanation of the abstraction you applied at @packages/apps/cli/NAME_OF_THE_ABSTRACTION.abstraction.md.
                `
            },
        },
    ],
    keepHistory: true,
    verbose: true,
})