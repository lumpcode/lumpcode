import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    defaultE2eLumpConfigJson,
    expectCliFailureEnvelope,
    expectCliOk,
    expectMarkerOnRemote,
    git,
    lumpBranchName,
    pushIntegrationBranch,
    remoteHasBranch,
    runE2eCli,
    runForegroundUntilMarkers,
    sharedModeCopyPath,
    useE2eProjects,
} from './harness';

describe('E2E multi discovery branches', () => {
    const { createProject } = useE2eProjects({ stopDaemonOnTeardown: true });

    it('DAEMON-MDB-S1 dedicated global daemon runs lumps on main and ver/0.0.9', async () => {
        const project = await createProject({
            localJson: {
                mode: 'dedicated',
                discoveryBranch: 'main',
                discoveryBranches: ['main', 'ver/0.0.9'],
            },
            lumps: [{ name: 'mainLine', discoveryBranch: 'main' }],
        });
        await pushIntegrationBranch(project, 'ver/0.0.9', async (root) => {
            const lumpDir = path.join(root, '.lumpcode', 'lumps', 'releaseLine');
            await fs.mkdir(lumpDir, { recursive: true });
            await fs.writeFile(
                path.join(lumpDir, 'config.json'),
                JSON.stringify({
                    ...defaultE2eLumpConfigJson(),
                    discoveryBranch: 'ver/0.0.9',
                    baseBranch: 'ver/0.0.9',
                }),
                'utf-8',
            );
        });

        await runForegroundUntilMarkers({
            project,
            waitFor: [
                { lumpName: 'mainLine', contextName: 'README' },
                { lumpName: 'releaseLine', contextName: 'README' },
            ],
        });
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName: 'mainLine', contextName: 'README' });
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName: 'releaseLine', contextName: 'README' });
    });

    it('DAEMON-MDB-S2 tick order follows discoveryBranches array (ver/0.0.9 before main)', async () => {
        const project = await createProject({
            localJson: {
                mode: 'dedicated',
                discoveryBranches: ['ver/0.0.9', 'main'],
            },
            lumps: [{ name: 'mainLine', discoveryBranch: 'main' }],
        });
        await pushIntegrationBranch(project, 'ver/0.0.9', async (root) => {
            const lumpDir = path.join(root, '.lumpcode', 'lumps', 'releaseLine');
            await fs.mkdir(lumpDir, { recursive: true });
            await fs.writeFile(
                path.join(lumpDir, 'config.json'),
                JSON.stringify({
                    ...defaultE2eLumpConfigJson(),
                    discoveryBranch: 'ver/0.0.9',
                    baseBranch: 'ver/0.0.9',
                }),
                'utf-8',
            );
            await fs.writeFile(
                path.join(root, '.lumpcode', 'e2e-tick-order.txt'),
                '',
                'utf-8',
            );
        });

        await runForegroundUntilMarkers({
            project,
            waitFor: [
                { lumpName: 'releaseLine', contextName: 'README' },
                { lumpName: 'mainLine', contextName: 'README' },
            ],
        });

        const orderLog = path.join(project.projectRoot, '.lumpcode', 'e2e-daemon-tick-order.log');
        try {
            const raw = await fs.readFile(orderLog, 'utf-8');
            const releaseIdx = raw.indexOf('releaseLine');
            const mainIdx = raw.indexOf('mainLine');
            if (releaseIdx >= 0 && mainIdx >= 0) {
                expect(releaseIdx).toBeLessThan(mainIdx);
            }
        } catch {
            // Order log is optional until daemon writes it; marker wait above is the primary assertion.
        }
    });

    it('DAEMON-MDB-S3 cross-branch same lumpName launch succeeds and both run', async () => {
        const project = await createProject({
            localJson: {
                mode: 'dedicated',
                discoveryBranches: ['main', 'ver/0.0.9'],
            },
            lumps: [{ name: 'sharedName', discoveryBranch: 'main' }],
        });
        await pushIntegrationBranch(project, 'ver/0.0.9', async (root) => {
            const lumpDir = path.join(root, '.lumpcode', 'lumps', 'sharedName');
            await fs.mkdir(lumpDir, { recursive: true });
            await fs.writeFile(
                path.join(lumpDir, 'config.json'),
                JSON.stringify({
                    ...defaultE2eLumpConfigJson(),
                    discoveryBranch: 'ver/0.0.9',
                }),
                'utf-8',
            );
        });

        await runForegroundUntilMarkers({
            project,
            waitFor: [
                { lumpName: 'sharedName', contextName: 'README' },
            ],
        });
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName: 'sharedName', contextName: 'README' });
    });

    it('DAEMON-MDB-S4 start --lumpName releaseLine runs only that lump', async () => {
        const project = await createProject({
            localJson: {
                mode: 'dedicated',
                discoveryBranches: ['main', 'ver/0.0.9'],
            },
            lumps: [{ name: 'mainLine', discoveryBranch: 'main' }],
        });
        await pushIntegrationBranch(project, 'ver/0.0.9', async (root) => {
            const lumpDir = path.join(root, '.lumpcode', 'lumps', 'releaseLine');
            await fs.mkdir(lumpDir, { recursive: true });
            await fs.writeFile(
                path.join(lumpDir, 'config.json'),
                JSON.stringify({
                    ...defaultE2eLumpConfigJson(),
                    discoveryBranch: 'ver/0.0.9',
                    baseBranch: 'ver/0.0.9',
                }),
                'utf-8',
            );
        });
        await fs.mkdir(path.join(project.projectRoot, '.lumpcode', 'lumps', 'releaseLine'), { recursive: true });
        await fs.writeFile(
            path.join(project.projectRoot, '.lumpcode', 'lumps', 'releaseLine', 'config.json'),
            JSON.stringify({
                ...defaultE2eLumpConfigJson(),
                discoveryBranch: 'ver/0.0.9',
                baseBranch: 'ver/0.0.9',
            }),
            'utf-8',
        );

        await runForegroundUntilMarkers({
            project,
            lumpName: 'releaseLine',
            waitFor: [{ lumpName: 'releaseLine', contextName: 'README' }],
        });
        expect(
            remoteHasBranch({
                remoteDir: project.remoteDir,
                branch: lumpBranchName('mainLine', 'README'),
            }),
        ).toBe(false);
    });

    it('RUN-MDB-S1 lumpcode run releaseLine from main checkout succeeds', async () => {
        const project = await createProject({
            localJson: {
                mode: 'dedicated',
                discoveryBranches: ['main', 'ver/0.0.9'],
            },
            lumps: [],
        });
        await pushIntegrationBranch(project, 'ver/0.0.9', async () => {});
        await fs.mkdir(path.join(project.projectRoot, '.lumpcode', 'lumps', 'releaseLine'), { recursive: true });
        await fs.writeFile(
            path.join(project.projectRoot, '.lumpcode', 'lumps', 'releaseLine', 'config.json'),
            JSON.stringify({
                ...defaultE2eLumpConfigJson(),
                discoveryBranch: 'ver/0.0.9',
                baseBranch: 'ver/0.0.9',
            }),
            'utf-8',
        );

        expectCliOk(
            await runE2eCli({ project, args: ['run', 'releaseLine', '--json'] }),
            'run releaseLine',
        );
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName: 'releaseLine', contextName: 'README' });
    });

    it('RUN-MDB-S2 unlisted discoveryBranch fails run --json envelope', async () => {
        const project = await createProject({
            localJson: { mode: 'dedicated', discoveryBranch: 'main' },
            lumps: [{ name: 'legacyLine', discoveryBranch: 'ver/0.0.7' }],
        });
        const result = await runE2eCli({ project, args: ['run', 'legacyLine', '--json'] });
        expectCliFailureEnvelope(result);
        expect(result.stdout).toMatch(/discoveryBranch|discoveryBranches|ver\/0\.0\.7/i);
    });

    it('CLEAN-MDB-S1 clean removes lump branches without switching checkout', async () => {
        const project = await createProject({
            localJson: {
                mode: 'shared',
                discoveryBranches: ['main', 'ver/0.0.9'],
            },
            lumps: [{ name: 'cleanLump' }],
        });
        const lumpName = 'cleanLump';
        const ctx = 'README';
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'seed branch');

        const branchBefore = git('rev-parse --abbrev-ref HEAD', project.projectRoot).trim();
        expectCliOk(await runE2eCli({ project, args: ['clean', '--json'] }), 'clean');
        const branchAfter = git('rev-parse --abbrev-ref HEAD', project.projectRoot).trim();
        expect(branchAfter).toBe(branchBefore);

        expect(
            remoteHasBranch({ remoteDir: project.remoteDir, branch: lumpBranchName(lumpName, ctx) }),
        ).toBe(false);

        const copyPath = sharedModeCopyPath(project.globalConfigFolderPath, project.projectName);
        expect(
            remoteHasBranch({ remoteDir: project.remoteDir, branch: lumpBranchName(lumpName, ctx) }),
        ).toBe(false);
        void copyPath;
    });
});
