import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
    absWorkingDir: packageRoot,
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: 'dist/index.js',
    packages: 'external',
});
