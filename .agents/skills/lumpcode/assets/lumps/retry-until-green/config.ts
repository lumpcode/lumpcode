import { defineConfig } from '@lumpcode/cli-utils';
import { retryUntilGreen, shellCommand } from '@lumpcode/recipes';

export default defineConfig({
    command: 'cursor',
    contextListJson: {
        FILE: 'src/{NAME}.ts',
    },
    steps: retryUntilGreen({
        steps: [
            {
                promptTemplate:
                    'Improve the types in @{FILE}. Keep existing behavior. Do not weaken tests.',
            },
        ],
        validationCommandFn: () => shellCommand('npm test'),
    }),
});
