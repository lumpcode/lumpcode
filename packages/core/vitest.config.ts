import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    typecheck: {
      enabled: true,
      include: ['**/*.types.test.ts'],
      tsconfig: './tsconfig.typecheck.json',
      ignoreSourceErrors: true,
    },
  },
});
