import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

const isDevBuild = process.env.BUILD_DEV === 'true';

export default defineConfig({
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    {
      file: 'dist/index.js',
      format: 'esm',
      sourcemap: true
    }
  ],
  external: [
    // Mark Node.js built-ins as external
    'node:child_process',
    'node:util',
    'node:fs/promises',
    'node:path',
    // Mark dependencies as external
    'ignore',
    'zod',
    'type-fest'
  ],
  plugins: [
    nodeResolve({
      preferBuiltins: true
    }),
    commonjs(),
    json(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: !isDevBuild,
      declarationMap: !isDevBuild,
      declarationDir: isDevBuild ? undefined : './dist',
      rootDir: './src',
    }),
  ]
});
