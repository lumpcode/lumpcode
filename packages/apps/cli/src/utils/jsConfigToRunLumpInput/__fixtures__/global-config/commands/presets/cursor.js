import { defineCommand, defineCommandSetup, defineCommandTeardown } from '@lumpcode/cli-types';

export const command = defineCommand(({ prompt, stepVariables }) => {
    const { model = 'composer-2.5' } = stepVariables || {};

    return {
        executable: 'cursor-agent',
        args: [
            '-p',
            `"${prompt}"`,
            '--force',
            '--model',
            model,
        ],
    }
});

export const setup = defineCommandSetup(async ({}) => {
    return {};
});

export const teardown = defineCommandTeardown(() => {
    return;
});
