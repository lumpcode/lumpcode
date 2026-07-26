import { defineConfig, StepFn } from '@lumpcode/cli-utils';

type Vars = {validationSucceeded: boolean | null};

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
                args: ['"Tests passed"'],
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
                lumpVariables,
                commandSucceeded,
            }) {
                const lumpVars = lumpVariables as Vars;
                if (commandSucceeded) {
                    lumpVars.validationSucceeded = true;
                } else {
                    lumpVars.validationSucceeded = false;
                }
            }
        },
        ({ lumpVariables }) => {
            const lumpVars = lumpVariables as Vars;
            if (lumpVars.validationSucceeded === false) {
                return retryStep();
            }
            return endStep();
        }
    ];
}) satisfies StepFn;

export default defineConfig<Vars>({
    steps: entry()
});