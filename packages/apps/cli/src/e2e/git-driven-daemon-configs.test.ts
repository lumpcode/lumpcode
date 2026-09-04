import { describe, expect, it } from 'vitest';

import { pollUntil, readDaemonMeta } from '../utils';
import {
    daemonPathsForProject,
    expectCliOk,
    expectDaemonRunning,
    runE2eCli,
    useE2eProjects,
    waitForPath,
} from './harness';

describe('E2E git-driven daemon configs', () => {
    const { createProject } = useE2eProjects({ stopDaemonOnTeardown: true });

    it('DAEMON-CFG-S1 superviseOnly starts file recipe; stop --all stops supervise', async () => {
        const project = await createProject({
            projectName: 'e2e-daemon-cfg',
            lumps: [{ name: 'alpha' }],
            extraFiles: {
                '.lumpcode/daemons/nightly.json': `${JSON.stringify(
                    {
                        discoveryBranch: 'main',
                        cronSetup: '0 0 1 1 *',
                        include: ['alpha'],
                    },
                    null,
                    2,
                )}\n`,
            },
        });

        expectCliOk(
            await runE2eCli({ project, args: ['start', '--superviseOnly', '--json'] }),
            'superviseOnly start',
        );

        const { pidFilePath, metaFilePath } = daemonPathsForProject(project, 'nightly');
        await waitForPath(pidFilePath, 60_000);
        await waitForPath(metaFilePath, 60_000);

        await pollUntil({
            timeoutMs: 30_000,
            intervalMs: 100,
            timeoutError: 'Timed out waiting for daemonConfigFile in nightly meta',
            poll: async () => {
                const meta = await readDaemonMeta(metaFilePath);
                if (!meta.success || meta.data.daemonConfigFile === undefined) {
                    return undefined;
                }
                return meta.data.daemonConfigFile.path === '.lumpcode/daemons/nightly.json'
                    ? true
                    : undefined;
            },
        });

        const status = await runE2eCli({
            project,
            args: ['daemon-status', '--daemonId', 'nightly', '--json'],
        });
        expectCliOk(status, 'daemon-status nightly');
        expectDaemonRunning(status, true, 'nightly');
        expect(status.json.data).toMatchObject({
            daemonConfigFile: {
                path: '.lumpcode/daemons/nightly.json',
                discoveryBranch: 'main',
            },
        });

        expectCliOk(
            await runE2eCli({ project, args: ['stop', '--all', '--json'] }),
            'stop --all',
        );

        const after = await runE2eCli({ project, args: ['daemon-status', '--json'] });
        expectCliOk(after, 'daemon-status after stop --all');
        const data = after.json.data as {
            daemons: unknown[];
            supervisor: { running: boolean };
        };
        expect(data.daemons).toEqual([]);
        expect(data.supervisor.running).toBe(false);
    });
});
