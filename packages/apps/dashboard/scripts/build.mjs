import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const logoMarkPng = readFileSync(join(packageRoot, 'src/logo-mark.png'));
const logoMarkDataUrl = `data:image/png;base64,${logoMarkPng.toString('base64')}`;

await build({
    absWorkingDir: packageRoot,
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: 'dist/index.js',
    packages: 'external',
    plugins: [
        {
            name: 'inline-logo-mark',
            setup(bundle) {
                bundle.onLoad({ filter: /logoMark\.ts$/ }, () => ({
                    contents: `export const logoMarkDataUrl = ${JSON.stringify(logoMarkDataUrl)};`,
                    loader: 'js',
                }));
            },
        },
    ],
});
