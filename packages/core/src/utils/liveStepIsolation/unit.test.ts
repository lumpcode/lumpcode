import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    isRunning,
    orphanLeavingShellArgs,
    waitForReadyFile,
} from '../../testing/processTreeTestHelpers';
import { detectSystemdScope, systemdScopeUnitName } from '../systemdScope';

const coreDistEntry = fileURLToPath(new URL('../../../dist/index.cjs', import.meta.url));
const scopeSupport = await detectSystemdScope();

const isolationCases = [
    {
        name: 'its own process group',
        enabled: process.platform !== 'win32',
        isolation: () => ({ kind: 'processGroup' }),
    },
    {
        name: 'a systemd scope',
        enabled: scopeSupport.available,
        isolation: () => ({
            kind: 'systemdScope',
            unitName: systemdScopeUnitName({ lumpName: 'exitHook', contextName: 'test', stepIndex: 0 }),
        }),
    },
];

describe.each(isolationCases)('live step isolation on process exit, in $name', ({ enabled, isolation }) => {
    const activePids = new Set<number>();
    let tmpDir = '';

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumpcode-live-step-isolation-'));
    });

    afterEach(async () => {
        for (const pid of activePids) {
            try {
                process.kill(pid, 'SIGKILL');
            } catch {
                // already gone
            }
        }
        activePids.clear();
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it.skipIf(!enabled)('kills a running step box, orphans included, when the owning process force-exits', async () => {
        const readyFile = path.join(tmpDir, 'ready.json');
        const args = orphanLeavingShellArgs({ readyFile, tail: 'sleep 60' });
        const script = `
const fs = require('node:fs');
const { execBinary } = require(${JSON.stringify(coreDistEntry)});
void execBinary({ binaryPath: 'sh', args: ${JSON.stringify(args)}, timeoutMillis: 60000, isolation: ${JSON.stringify(isolation())} });
const poll = setInterval(() => {
    if (fs.existsSync(${JSON.stringify(readyFile)})) {
        clearInterval(poll);
        process.exit(130);
    }
}, 20);
`;
        const owner = spawn(process.execPath, ['-e', script], { stdio: 'ignore' });
        const exitCode = await new Promise<number | null>((resolve) => {
            owner.on('exit', (code) => resolve(code));
        });
        expect(exitCode).toBe(130);

        const { pids } = await waitForReadyFile(readyFile);
        for (const pid of pids) activePids.add(pid);
        for (const pid of pids) {
            await vi.waitFor(async () => {
                expect(await isRunning(pid)).toBe(false);
            }, { timeout: 2000 });
        }
    });
});
