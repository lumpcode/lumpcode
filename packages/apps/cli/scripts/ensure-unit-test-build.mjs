import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const monorepoRoot = path.resolve(pkgRoot, '../../..');

/** @type {Array<{ workspace: string; artifact: string }>} */
const workspaceBuilds = [
    { workspace: '@lumpcode/core', artifact: 'packages/core/dist/index.js' },
    { workspace: '@lumpcode/cli-utils', artifact: 'packages/apps/cli/cli-utils/dist/index.js' },
    { workspace: '@lumpcode/cli-types', artifact: 'packages/apps/cli/cli-types/dist/index.js' },
];

function runNpm(args, cwd) {
    const result = spawnSync('npm', args, {
        cwd,
        stdio: 'inherit',
        env: process.env,
    });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

for (const { workspace, artifact } of workspaceBuilds) {
    const artifactPath = path.join(monorepoRoot, artifact);
    if (!fs.existsSync(artifactPath)) {
        runNpm(['run', 'build', '-w', workspace], monorepoRoot);
    }
}

const cliBundlePath = path.join(pkgRoot, 'dist', 'index.js');
if (!fs.existsSync(cliBundlePath)) {
    runNpm(['run', 'build:bundle'], pkgRoot);
}
