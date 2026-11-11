import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const turboPackageJson = require.resolve('turbo/package.json');
const executable = path.join(path.dirname(turboPackageJson), 'bin', 'turbo');

const packages = [
    '@lumpcode/core',
    '@lumpcode/cli-types',
    '@lumpcode/cli-utils',
    '@lumpcode/recipes',
    '@lumpcode/dashboard',
    '@lumpcode/cli',
];

const args = [
    'run',
    'build',
    ...packages.flatMap((name) => ['--filter', name]),
    ...process.argv.slice(2),
];

const result = spawnSync(executable, args, {
    stdio: 'inherit',
    env: {
        ...process.env,
        TURBO_TELEMETRY_DISABLED: '1',
        DO_NOT_TRACK: '1',
    },
});

if (result.error) {
    console.error(result.error.message);
    process.exit(1);
}

process.exit(result.status ?? 1);
