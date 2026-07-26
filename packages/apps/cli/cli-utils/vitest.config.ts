import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@lumpcode/cli-utils': path.resolve(__dirname, 'src/index.ts'),
      '@lumpcode/cli-types': path.resolve(__dirname, '../cli-types/src/index.ts'),
      '@lumpcode/core': path.resolve(__dirname, '../../../core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.types.test.ts'],
    typecheck: {
      enabled: true,
      include: ['**/*.types.test.ts'],
      tsconfig: './tsconfig.typecheck.json',
      ignoreSourceErrors: true,
    },
  },
});
