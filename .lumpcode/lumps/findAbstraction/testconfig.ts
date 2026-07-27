import { defineConfig, StepFn } from '@lumpcode/cli-utils';

const entry = (() => {
    return [
        {
            promptTemplate: "Implement a function that adds two numbers",
        },
        verifyStep,
    ];
}) satisfies StepFn;

const retryStep = (() => {
    return {
        promptTemplate: "Tests failed. Retry the implementation",
    };
}) satisfies StepFn;

const endStep = (() => {
    return {
        commandFn() {
            return {
                executable: 'echo',
                args: ['Tests passed'],
            };
        }
    };
}) satisfies StepFn;

const verifyStep = (() => {
    return [
        {
            commandFn() {
                return {
                    executable: 'npm',
                    args: ['run', 'test'],
                };
            },
            continueOnError: true,
            postCommandExecFn({
                commandSucceeded,
            }) {
                if (commandSucceeded) {
                    return endStep();
                } else {
                    return retryStep();
                }
            }
        }
    ];
}) satisfies StepFn;

export default defineConfig({
    steps: entry()
});