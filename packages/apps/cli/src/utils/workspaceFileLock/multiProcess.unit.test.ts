import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const workerPath = fileURLToPath(new URL('./testing/lockStressWorker.ts', import.meta.url));

/** vite-node ships with vitest 3 and runs the TypeScript worker as-is in a child process. */
function resolveViteNodeCli(): string | undefined {
    try {
        const require = createRequire(import.meta.url);
        return path.join(path.dirname(require.resolve('vite-node/package.json')), 'vite-node.mjs');
    } catch {
        return undefined;
    }
}
const viteNodeCli = resolveViteNodeCli();

type WorkerReport = { acquired: number; busy: number; violations: number };

describe.skipIf(viteNodeCli === undefined)('workspaceFileLock across processes', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-file-lock-stress-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    async function runWorkers(input: { processes: number; lines: number; iterations: number; mode: 'fail' | 'wait' }) {
        const markerPath = path.join(dir, 'marker');
        const runs = Array.from({ length: input.processes }, () =>
            execFileAsync(
                process.execPath,
                [viteNodeCli!, workerPath, dir, path.join(dir, 'workspace'), markerPath, String(input.lines), String(input.iterations), input.mode],
                { timeout: 90_000 },
            ),
        );
        return (await Promise.all(runs)).map(({ stdout }) => JSON.parse(stdout.trim().split('\n').pop()!) as WorkerReport);
    }

    it.each(['fail', 'wait'] as const)('never lets two holders in (%s mode, several processes with several lines each)', async (mode) => {
        const reports = await runWorkers({ processes: 4, lines: 3, iterations: mode === 'fail' ? 20 : 6, mode });

        expect(reports.reduce((sum, r) => sum + r.violations, 0)).toBe(0);
        expect(reports.reduce((sum, r) => sum + r.acquired, 0)).toBeGreaterThan(0);
        const leftovers = (await fs.readdir(path.join(dir, 'stress-locks'))).filter((f) => f.endsWith('.lock') || f.endsWith('.lock.json'));
        expect(leftovers).toEqual([]);
    }, 120_000);
});
