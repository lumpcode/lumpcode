import { defineCommand, defineCommandSetup, defineCommandTeardown } from '@lumpcode/cli-types';

export const command = defineCommand(({ prompt, stepVariables }) => {
    const { model = 'auto' } = stepVariables || {};

    return {
        executable: 'copilot',
        args: [
            '-p',
            prompt,
            '--allow-all-tools',
            '--silent',
            '--model',
            model,
        ],
    };
});

export const setup = defineCommandSetup(async ({}) => {
    return {};
});

export const teardown = defineCommandTeardown(() => {
    return;
});
