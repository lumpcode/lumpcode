import { defineConfig, type StepFn } from '@lumpcode/cli-utils';

const endStep: StepFn = () => ({
    commandFn() {
        return {
            executable: 'echo',
            args: ['Tests passed'],
        };
    },
});

const retryStep: StepFn = () => [
    {
        promptTemplate: 'Tests failed. Retry the implementation',
    },
    verifyStep,
];

const verifyStep: StepFn = () => [
    {
        commandFn() {
            return {
                executable: 'npm',
                args: ['run', 'test'],
            };
        },
        continueOnError: true,
        postCommandExecFn(input) {
            if (input.commandSucceeded) {
                return endStep(input);
            } else {
                return retryStep(input);
            }
        },
    },
];

const entry: StepFn = () => [
    {
        promptTemplate: 'Implement a function that adds two numbers',
    },
    verifyStep,
];

export default defineConfig({
    steps: entry,
});
