import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { isDaemonMidRun, readDaemonMeta } from '../utils/readDaemonMeta';
import { gitCommonDirLocksDirPath } from '../utils/gitCommonDirLock';
import { pollUntil } from '../utils/pollUntil';
import { workspacePathLocksDirPath } from '../utils/workspacePathLock';
import {
    daemonPathsForProject,
    e2eCliInvocation,
    expectCliOk,
    expectDaemonRunning,
    expectMarkerOnRemote,
    lumpBranchName,
    remoteHasBranch,
    runE2eCli,
    runForegroundUntilMarkers,
    subprocessEnv,
    useE2eProjects,
    waitForDaemonIdle,
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
        await waitForPath(pidFilePath, 30_000);
        await waitForPath(metaFilePath, 30_000);

        const status = await runE2eCli({ project, args: ['daemon-status', '--json'] });
        expectCliOk(status, 'daemon-status');
        expectDaemonRunning(status, true);

        await waitForDaemonIdle({ metaFilePath });
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

    it('stop --all drain still exits and releases locks after the wait is interrupted', async () => {
        const lumpName = 'slowLump';
        const project = await createProject({
            lumps: [{
                name: lumpName,
                useE2eAgent: false,
                configJs: `export default {
  baseBranch: 'main',
  contextListJson: { NAME: '{NAME}.md' },
  prompt: { promptTemplate: 'E2E @{NAME}', command: './slow-command.js' },
  numberOfContextsPerBranch: 1,
};`,
                hookFiles: {
                    'slow-command.js': `export const command = () => ({
  executable: process.env.LUMPCODE_E2E_NODE || 'node',
  args: ['-e', 'setTimeout(() => {}, 20000)'],
});
`,
                },
            }],
        });
        const paths = daemonPathsForProject(project);
        expectCliOk(
            await runE2eCli({ project, args: ['start', '--cronSetup', '*/1 * * * *', '--json'] }),
            'detached start',
        );
        await waitForPath(paths.pidFilePath, 30_000);
        const daemonPid = Number.parseInt((await fs.readFile(paths.pidFilePath, 'utf8')).trim(), 10);
        expect(Number.isNaN(daemonPid)).toBe(false);

        await pollUntil({
            timeoutMs: 90_000,
            intervalMs: 100,
            timeoutError: `daemon did not go mid-run at ${paths.metaFilePath}`,
            poll: async () => {
                const metaResult = await readDaemonMeta(paths.metaFilePath);
                if (!metaResult.success) return undefined;
                return isDaemonMidRun(metaResult.data) ? true : undefined;
            },
        });

        const invocation = e2eCliInvocation();
        const stopChild = spawn(invocation.executable, [...invocation.argsPrefix, 'stop', '--all'], {
            cwd: project.projectRoot,
            env: subprocessEnv(project.homeDir),
            // New process group so SIGINT reaches the launcher and the CLI child, as Ctrl+C does.
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stopOutput = '';
        stopChild.stdout?.on('data', (chunk: Buffer) => {
            stopOutput += chunk.toString();
        });
        stopChild.stderr?.on('data', (chunk: Buffer) => {
            stopOutput += chunk.toString();
        });
        try {
            await pollUntil({
                timeoutMs: 30_000,
                intervalMs: 50,
                timeoutError: () =>
                    new Error(`stop --all did not log a drain wait.\n${stopOutput}`),
                poll: () => (stopOutput.includes('waiting for drain') ? true : undefined),
            });
            const stopExited = new Promise<void>((resolve) => {
                if (stopChild.exitCode !== null || stopChild.signalCode !== null) {
                    resolve();
                    return;
                }
                stopChild.once('close', () => resolve());
            });
            if (stopChild.pid !== undefined) {
                try {
                    process.kill(-stopChild.pid, 'SIGINT');
                } catch {
                    stopChild.kill('SIGINT');
                }
            }
            await Promise.race([
                stopExited,
                new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error(`stop did not exit after SIGINT.\n${stopOutput}`)), 10_000);
                }),
            ]);

            await pollUntil({
                timeoutMs: 60_000,
                intervalMs: 200,
                timeoutError: () =>
                    new Error(
                        `draining daemon pid ${daemonPid} did not exit and release locks.\n${stopOutput}`,
                    ),
                poll: async () => {
                    try {
                        process.kill(daemonPid, 0);
                        return undefined;
                    } catch (error) {
                        const code = (error as NodeJS.ErrnoException).code;
                        if (code !== 'ESRCH') throw error;
                    }
                    for (const filePath of [paths.pidFilePath, paths.metaFilePath, paths.desiredFilePath]) {
                        try {
                            await fs.access(filePath);
                            return undefined;
                        } catch (error) {
                            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                        }
                    }
                    const held = [
                        ...(await lockFilesHoldingPid(
                            workspacePathLocksDirPath({
                                globalConfigFolderPath: project.globalConfigFolderPath,
                            }),
                            daemonPid,
                        )),
                        ...(await lockFilesHoldingPid(
                            gitCommonDirLocksDirPath({
                                globalConfigFolderPath: project.globalConfigFolderPath,
                            }),
                            daemonPid,
                        )),
                    ];
                    return held.length === 0 ? true : undefined;
                },
            });
        } finally {
            if (stopChild.exitCode === null && stopChild.signalCode === null && stopChild.pid !== undefined) {
                try {
                    process.kill(-stopChild.pid, 'SIGKILL');
                } catch {
                    stopChild.kill('SIGKILL');
                }
            }
        }
    }, 180_000);
});

async function lockFilesHoldingPid(dir: string, pid: number): Promise<string[]> {
    let names: string[];
    try {
        names = await fs.readdir(dir);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
    const held: string[] = [];
    for (const name of names) {
        const filePath = path.join(dir, name);
        let raw: string;
        try {
            raw = await fs.readFile(filePath, 'utf8');
        } catch {
            continue;
        }
        try {
            const parsed = JSON.parse(raw) as { pid?: unknown };
            if (parsed.pid === pid) held.push(filePath);
        } catch {
            // not a lock payload
        }
    }
    return held;
}
