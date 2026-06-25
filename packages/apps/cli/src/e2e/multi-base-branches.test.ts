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

describe('E2E multi project base branches', () => {
    const { createProject } = useE2eProjects({ stopDaemonOnTeardown: true });

    it('DAEMON-MBB-S1 dedicated global daemon runs lumps on main and ver/0.0.9', async () => {
        const project = await createProject({
            localJson: {
                mode: 'dedicated',
                projectBaseBranch: 'main',
                projectBaseBranches: ['main', 'ver/0.0.9'],
            },
            lumps: [{ name: 'mainLine' }],
        });
        await pushIntegrationBranch(project, 'ver/0.0.9', async (root) => {
            const lumpDir = path.join(root, '.lumpcode', 'lumps', 'releaseLine');
            await fs.mkdir(lumpDir, { recursive: true });
            await fs.writeFile(
                path.join(lumpDir, 'config.json'),
                JSON.stringify({
                    ...defaultE2eLumpConfigJson(),
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

    it('DAEMON-MBB-S3 duplicate lump name on two branches fails start', async () => {
        const project = await createProject({
            localJson: {
                mode: 'dedicated',
                projectBaseBranches: ['main', 'ver/0.0.9'],
            },
            lumps: [{ name: 'sameName' }],
        });
        await pushIntegrationBranch(project, 'ver/0.0.9', async (root) => {
            const lumpDir = path.join(root, '.lumpcode', 'lumps', 'sameName');
            await fs.mkdir(lumpDir, { recursive: true });
            await fs.writeFile(
                path.join(lumpDir, 'config.json'),
                JSON.stringify(defaultE2eLumpConfigJson()),
                'utf-8',
            );
        });

        const start = await runE2eCli({
            project,
            args: ['start', '--foreground', '--cronSetup', '*/1 * * * *', '--json'],
        });
        expectCliFailureEnvelope(start);
        expect(start.stdout).toMatch(/duplicate|sameName/i);
    });

    it('DAEMON-MBB-S4 start --lumpName releaseLine runs only that lump', async () => {
        const project = await createProject({
            localJson: {
                mode: 'dedicated',
                projectBaseBranches: ['main', 'ver/0.0.9'],
            },
            lumps: [{ name: 'mainLine' }],
        });
        await pushIntegrationBranch(project, 'ver/0.0.9', async (root) => {
            const lumpDir = path.join(root, '.lumpcode', 'lumps', 'releaseLine');
            await fs.mkdir(lumpDir, { recursive: true });
            await fs.writeFile(
                path.join(lumpDir, 'config.json'),
                JSON.stringify({
                    ...defaultE2eLumpConfigJson(),
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

    it('RUN-MBB-S1 lumpcode run releaseLine from main checkout succeeds', async () => {
        const project = await createProject({
            localJson: {
                mode: 'dedicated',
                projectBaseBranches: ['main', 'ver/0.0.9'],
            },
            lumps: [],
        });
        await pushIntegrationBranch(project, 'ver/0.0.9', async () => {});
        await fs.mkdir(path.join(project.projectRoot, '.lumpcode', 'lumps', 'releaseLine'), { recursive: true });
        await fs.writeFile(
            path.join(project.projectRoot, '.lumpcode', 'lumps', 'releaseLine', 'config.json'),
            JSON.stringify({
                ...defaultE2eLumpConfigJson(),
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

    it('RUN-MBB-S2 unlisted baseBranch fails run --json envelope', async () => {
        const project = await createProject({
            localJson: { mode: 'dedicated', projectBaseBranch: 'main' },
            lumps: [{ name: 'legacyLine', baseBranch: 'ver/0.0.7' }],
        });
        const result = await runE2eCli({ project, args: ['run', 'legacyLine', '--json'] });
        expectCliFailureEnvelope(result);
        expect(result.stdout).toMatch(/allowlist|projectBaseBranches|ver\/0\.0\.7/i);
    });

    it('CLEAN-MBB-S1 clean removes lump branches without switching checkout', async () => {
        const project = await createProject({
            localJson: {
                mode: 'shared',
                projectBaseBranches: ['main', 'ver/0.0.9'],
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
