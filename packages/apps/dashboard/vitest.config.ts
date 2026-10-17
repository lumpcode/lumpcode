import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        testTimeout: 40_000,
        hookTimeout: 40_000,
    },
});
