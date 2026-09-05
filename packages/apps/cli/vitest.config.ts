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
        typecheck: {
            enabled: true,
            // Scope to CLI src only — `**/*.types.test.ts` also matches cli-utils/cli-types.
            include: ['src/**/*.types.test.ts'],
            tsconfig: './tsconfig.typecheck.json',
            ignoreSourceErrors: true,
        },
    },
});
