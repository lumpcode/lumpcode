import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/e2e/**/*.test.ts'],
        fileParallelism: false,
        maxWorkers: 1,
        testTimeout: 120_000,
        hookTimeout: 120_000,
    },
});
