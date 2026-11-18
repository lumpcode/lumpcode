import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectSystemdScope, systemdScopeUnitName } from '@lumpcode/core';

import { killBestEffort, startGroupWithOrphan, waitUntilPidGone } from '../../testing/groupWithOrphan';
import { writeJsonFile } from '../writeJsonFile';
import { killDaemonLeftovers } from './main';

const execFileAsync = promisify(execFile);
const scopeSupport = await detectSystemdScope();

describe.skipIf(process.platform === 'win32')('killDaemonLeftovers', () => {
    let dir: string;
    let metaFilePath: string;
    const pids: number[] = [];

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-kill-daemon-leftovers-'));
        metaFilePath = path.join(dir, 'demo.global.daemon.meta.json');
    });

    afterEach(async () => {
        killBestEffort(pids.splice(0));
        await fs.rm(dir, { recursive: true, force: true });
    });

    async function writeMeta(extra: Record<string, unknown>): Promise<void> {
        await writeJsonFile({
            filePath: metaFilePath,
            data: { daemonId: 'global', cronSetup: '*/5 * * * *', workspaceStrategy: 'checkout', ...extra },
        });
    }

    it('kills orphans in the dead daemon group and in its published step groups', async () => {
        const daemon = await startGroupWithOrphan({ dir, mode: 'leader-exit' });
        const step = await startGroupWithOrphan({ dir, mode: 'leader-exit' });
        pids.push(daemon.orphan, step.orphan);
        await writeMeta({ stepProcessGroups: [step.leader] });

        await killDaemonLeftovers({ daemonPid: daemon.leader, metaFilePath, label: 'daemon "global"' });

        await waitUntilPidGone(daemon.orphan);
        await waitUntilPidGone(step.orphan);
    });

    it('still kills the daemon group when the meta is missing', async () => {
        const daemon = await startGroupWithOrphan({ dir, mode: 'leader-exit' });
        pids.push(daemon.orphan);

        await killDaemonLeftovers({ daemonPid: daemon.leader, metaFilePath, label: 'daemon "global"' });

        await waitUntilPidGone(daemon.orphan);
    });

    it.skipIf(!scopeSupport.available)('empties published scopes, including processes that left their group', async () => {
        const unitName = systemdScopeUnitName({ lumpName: 'leftovers', contextName: 'test', stepIndex: 0 });
        const pidFile = path.join(dir, 'escaped.pid');
        await execFileAsync('systemd-run', [
            '--user', '--scope', '--quiet', '--collect', `--unit=${unitName}`, '--',
            'sh', '-c', `setsid sleep 600 > /dev/null 2>&1 < /dev/null & echo $! > '${pidFile}'`,
        ]);
        const escaped = Number.parseInt((await fs.readFile(pidFile, 'utf8')).trim(), 10);
        pids.push(escaped);
        await writeMeta({ stepSystemdScopes: [unitName] });

        await killDaemonLeftovers({ daemonPid: 999_999_999, metaFilePath, label: 'daemon "global"' });

        await waitUntilPidGone(escaped);
    });
});
