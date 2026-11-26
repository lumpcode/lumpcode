/**
 * Child process for the multi-process lock test. Runs `lines` concurrent lines, each taking the
 * lock `iterations` times; inside the lock it creates a shared marker file with `wx`, so a second
 * holder shows up as EEXIST. Prints one JSON line: { acquired, busy, violations }.
 * Args: <globalConfigFolderPath> <workspacePath> <markerPath> <lines> <iterations> <mode>
 */
import * as fs from 'node:fs/promises';

import { acquireWorkspaceFileLock, type WorkspaceLockMode } from '../main';

const [globalConfigFolderPath, workspacePath, markerPath, linesRaw, iterationsRaw, modeRaw] = process.argv.slice(2);
const mode = modeRaw as WorkspaceLockMode;
const spec = {
    locksSubdirName: 'stress-locks',
    busyCode: 'stressBusy',
    workspacePathField: 'stressPath',
    workspaceLabel: 'Stress path',
    waitLogNoun: 'stress path',
    staleLogNoun: 'stress lock',
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let acquired = 0;
let busy = 0;
let violations = 0;

async function line(index: number): Promise<void> {
    for (let i = 0; i < Number(iterationsRaw); i++) {
        const lock = await acquireWorkspaceFileLock({
            spec,
            globalConfigFolderPath: globalConfigFolderPath!,
            workspacePath: workspacePath!,
            lumpName: `p${process.pid}-line${index}`,
            mode,
            waitTimeoutMs: 120_000,
        });
        if (!lock.success) {
            busy += 1;
            await sleep(Math.random() * 20);
            continue;
        }
        acquired += 1;
        try {
            await fs.writeFile(markerPath!, String(process.pid), { flag: 'wx' });
        } catch {
            violations += 1;
        }
        await sleep(Math.random() * 15);
        await fs.unlink(markerPath!).catch(() => {});
        await lock.data();
    }
}

await Promise.all(Array.from({ length: Number(linesRaw) }, (_, index) => line(index)));
console.log(JSON.stringify({ acquired, busy, violations }));
