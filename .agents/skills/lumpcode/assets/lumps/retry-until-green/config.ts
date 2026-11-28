import { defineConfig } from '@lumpcode/cli-utils';
import { retryUntilGreenSteps, shellCommand } from '@lumpcode/recipes';

export default defineConfig({
    command: 'cursor',
    contextListJson: {
        FILE: 'src/{NAME}.ts',
    },
    steps: retryUntilGreenSteps({
        steps: [
            {
                promptTemplate:
                    'Improve the types in @{FILE}. Keep existing behavior. Do not weaken tests.',
            },
        ],
        validationCommandFn: () => shellCommand('npm test'),
    }),
});
