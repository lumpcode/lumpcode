import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts', 'src/**/*.integration.test.ts', 'scripts/**/*.test.mjs'],
        exclude: ['src/e2e/**'],
    },
});
