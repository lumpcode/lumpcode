import { defineConfig, type StepFn } from '@lumpcode/cli-utils';
import { shellCommand } from '@lumpcode/recipes';

const endStep: StepFn = () => ({
    commandFn() {
        return shellCommand('echo Verification passed');
    },
});

const retryStep: StepFn = ({ context, contextRunState }) => [
    {
        promptFn() {
            const file = context.variables.FILE ?? '@{FILE}';
            const output = contextRunState.verifyCommandResult ?? '(no output captured)';
            return [
                `Verification failed. Fix the implementation for @${file} so \`npm test\` passes.`,
                '',
                'Verification output:',
                '',
                String(output),
            ].join('\n');
        },
    },
    verifyStep,
];

const verifyStep: StepFn = () => [
    {
        commandFn() {
            return shellCommand('npm test');
        },
        continueOnError: true,
        postCommandExecFn(input) {
            if (input.commandSucceeded) {
                delete input.contextRunState.verifyCommandResult;
                return endStep(input);
            }
            input.contextRunState.verifyCommandResult = input.commandResult;
            return retryStep(input);
        },
    },
];

const entry: StepFn = () => [
    {
        promptTemplate:
            'Implement or fix @{FILE} so the project tests pass. Do not weaken or skip tests.',
    },
    verifyStep,
];

export default defineConfig({
    command: 'cursor',
    contextListJson: {
        FILE: 'src/{NAME}.ts',
    },
    steps: entry,
});
