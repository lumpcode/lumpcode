import fs from 'node:fs';

import { defineConfig } from '@lumpcode/cli-utils';
import { retryUntilGreen, shellCommand } from '@lumpcode/recipes';

export default defineConfig({
    command: 'cursor',
    maximumNumberOfConcurrentBranches: 5,
    contextMatchFn({ codeBasePath }) {
        const { isDir, path } = codeBasePath;
        if (isDir) return null;
        if (!path.endsWith('.ts') || path.endsWith('.test.ts') || path.endsWith('.d.ts')) {
            return null;
        }
        if (!path.startsWith('src/')) return null;
        const testPath = path.replace(/\.ts$/, '.test.ts');
        if (fs.existsSync(testPath)) return null;
        return {
            contextName: path.replaceAll('/', '_').replace(/\.ts$/, ''),
            filePathVariableName: 'SOURCE',
        };
    },
    steps: retryUntilGreen({
        steps: [
            {
                promptTemplate:
                    'Write a thorough Vitest suite for the module at @{SOURCE}. Save it next to it as a `.test.ts` file. Aim for branch coverage on exported functions.',
            },
        ],
        validationCommandFn: () => shellCommand('npm test'),
    }),
});
