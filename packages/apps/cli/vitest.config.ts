import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            esbuild: path.resolve(__dirname, 'src/testing/esbuildVitestShim.ts'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts', 'src/**/*.integration.test.ts', 'scripts/**/*.test.mjs'],
        exclude: ['src/e2e/**'],
    },
});
