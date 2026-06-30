import * as fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
    daemonPathsForProject,
    expectCliOk,
    expectDaemonRunning,
    expectMarkerOnRemote,
    lumpBranchName,
    remoteHasBranch,
    runE2eCli,
    runForegroundUntilMarkers,
    useE2eProjects,
    waitForPath,
} from './harness';

describe('E2E daemon scenarios', () => {
    const { createProject } = useE2eProjects({ stopDaemonOnTeardown: true });

    it('DAEMON-S1 daemon-foreground-tick', async () => {
        const lumpName = 'daemonLump';
        const project = await createProject({ lumps: [{ name: lumpName }] });
        await runForegroundUntilMarkers({
            project,
            lumpName,
            waitFor: [{ lumpName, contextName: 'README' }],
        });
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName, contextName: 'README' });
    });

    it('DAEMON-S2 daemon-detached-meta', async () => {
        const project = await createProject({ lumps: [{ name: 'daemonLump' }] });
        const { pidFilePath, metaFilePath } = daemonPathsForProject(project);

        expectCliOk(
            await runE2eCli({ project, args: ['start', '--cronSetup', '*/1 * * * *', '--json'] }),
            'detached start',
        );
        await expect(fs.access(pidFilePath)).rejects.toThrow();

        await waitForPath(pidFilePath, 30_000);
        await waitForPath(metaFilePath, 30_000);

        const status = await runE2eCli({ project, args: ['daemon-status', '--json'] });
        expectCliOk(status, 'daemon-status');
        expectDaemonRunning(status, true);

        expectCliOk(await runE2eCli({ project, args: ['stop', '--json'] }), 'stop');
    });

    it('DAEMON-S3 multi-lump-global-daemon', async () => {
        const project = await createProject({ lumps: [{ name: 'alpha' }, { name: 'beta' }] });
        await runForegroundUntilMarkers({
            project,
            waitFor: [
                { lumpName: 'alpha', contextName: 'README' },
                { lumpName: 'beta', contextName: 'README' },
            ],
        });
    });

    it('DAEMON-S4 lump-disabled-skipped', async () => {
        const project = await createProject({
                lumps: [
                    { name: 'enabled' },
                    { name: 'disabled', disabled: true },
                ],
            });
        const { stdout, stderr } = await runForegroundUntilMarkers({
            project,
            waitFor: [{ lumpName: 'enabled', contextName: 'README' }],
        });
        expect(`${stdout}\n${stderr}`).toMatch(/lump "disabled": skipped \(disabled\)/);
        expect(
            remoteHasBranch({
                remoteDir: project.remoteDir,
                branch: lumpBranchName('disabled', 'README'),
            }),
        ).toBe(false);
    });

    it('DAEMON-S5 per-lump-daemon', async () => {
        const project = await createProject({ lumps: [{ name: 'alpha' }, { name: 'beta' }] });
        const { metaFilePath } = daemonPathsForProject(project, 'alpha');
        expect(metaFilePath).toContain(`${project.projectName}.alpha.daemon.meta.json`);

        await runForegroundUntilMarkers({
            project,
            lumpName: 'alpha',
            waitFor: [{ lumpName: 'alpha', contextName: 'README' }],
        });
        expect(
            remoteHasBranch({
                remoteDir: project.remoteDir,
                branch: lumpBranchName('beta', 'README'),
            }),
        ).toBe(false);
    });
});
