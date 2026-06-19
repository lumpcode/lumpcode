import * as fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { lumpWorktreePath } from '../utils/getLumpWorktreePath';
import {
    createE2eLoopLumpConfigJs,
    e2eMarkerPath,
    expectCliOk,
    expectRunContextNames,
    expectRunSkippedTooManyOpenBranches,
    git,
    expectLumpMarkerCommit,
    expectMarkerOnRemote,
    e2eWorktreeCwdProbePath,
    e2ePathIncludesWorktreeSegment,
    lumpBranchName,
    markerPathInRepo,
    remoteHasBranch,
    remoteHasMarkerFile,
    remoteBranchFileContent,
    runE2eCli,
    seedFinishedContextOnMain,
    seedRemoteLumpBranch,
    sharedModeCopyPath,
    useE2eProjects,
} from './harness';

describe('E2E run scenarios', () => {
    const { createProject } = useE2eProjects();

    it('RUN-S1 run-single-context-checkout', async () => {
        const lumpName = 'myLump';
        const ctx = 'README';
        const project = await createProject({ lumps: [{ name: lumpName }] });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run');
        expect(remoteHasBranch({ remoteDir: project.remoteDir, branch: lumpBranchName(lumpName, ctx) })).toBe(true);
        expectLumpMarkerCommit({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
    });

    it('RUN-S2 run-resumable-skip', async () => {
        const lumpName = 'myLump';
        const project = await createProject({ lumps: [{ name: lumpName }] });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'first');
        const second = await runE2eCli({ project, args: ['run', lumpName, '--json'] });
        expectCliOk(second, 'second');
        expectRunContextNames(second, []);
    });

    it('RUN-S3 worktree-strategy with config.js command module', async () => {
        const lumpName = 'wtLump';
        const ctx = 'README';
        const commandModule = 'e2e-agent-wtLump';
        const project = await createProject({
                localJson: { workspaceStrategy: 'worktree' },
                lumps: [{
                    name: lumpName,
                    e2eCommandModule: commandModule,
                    e2eMockWriteWorkspaceCwd: true,
                    configJs: `export default {
  baseBranch: 'main',
  contextListJson: { NAME: '{NAME}.md' },
  prompt: {
    promptTemplate: 'E2E @{NAME}',
    command: '${commandModule}',
  },
  numberOfContextsPerBranch: 1,
};`,
                }],
            });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run');
        const branch = lumpBranchName(lumpName, ctx);
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
        expect(remoteHasBranch({ remoteDir: project.remoteDir, branch })).toBe(true);
        const branchWorkspaceCwd = remoteBranchFileContent({
            remoteDir: project.remoteDir,
            branch,
            filePath: e2eWorktreeCwdProbePath(lumpName),
        });
        expect(e2ePathIncludesWorktreeSegment(branchWorkspaceCwd)).toBe(true);
        const wt = lumpWorktreePath({ executionWorkspacePath: project.projectRoot, branchName: branch });
        await expect(fs.access(wt)).rejects.toThrow();
        expect(git('rev-parse --abbrev-ref HEAD', project.projectRoot)).toBe('main');
    });

    it('RUN-S4 shared-mode-run', async () => {
        const lumpName = 'myLump';
        const ctx = 'README';
        const project = await createProject({ localJson: { mode: 'shared' }, lumps: [{ name: lumpName }] });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run');
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
        const copy = sharedModeCopyPath(project.globalConfigFolderPath, project.projectName);
        expect(remoteHasMarkerFile({
            remoteDir: project.remoteDir,
            branch: lumpBranchName(lumpName, ctx),
            markerPath: markerPathInRepo(lumpName, ctx),
        })).toBe(true);
        await expect(fs.access(e2eMarkerPath(project.projectRoot, lumpName, ctx))).rejects.toThrow();
        await expect(fs.access(e2eMarkerPath(copy, lumpName, ctx))).rejects.toThrow();
    });

    it('RUN-S6 recursive-prompt-loop-three-failures-then-success', async () => {
        const lumpName = 'loopLump';
        const ctx = 'loopCtx';
        const project = await createProject({
            lumps: [{
                name: lumpName,
                configJs: createE2eLoopLumpConfigJs({ lumpName, contextName: ctx }),
            }],
        });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run');
        expect(remoteHasBranch({ remoteDir: project.remoteDir, branch: lumpBranchName(lumpName, ctx) })).toBe(true);
        expectLumpMarkerCommit({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
        const markerContent = remoteBranchFileContent({
            remoteDir: project.remoteDir,
            branch: lumpBranchName(lumpName, ctx),
            filePath: markerPathInRepo(lumpName, ctx),
        });
        expect(markerContent).toBe('attempts:4');
    });

    it('RUN-S7 cross-lump-depends-on-context', async () => {
        const depLumpName = 'depLump';
        const consumerLumpName = 'consumerLump';
        const ctx = 'README';
        const project = await createProject({
            lumps: [
                { name: depLumpName },
                {
                    name: consumerLumpName,
                    e2eCommandModule: `e2e-agent-${consumerLumpName}`,
                    configJs: `export default {
  baseBranch: 'main',
  contextListJson: { NAME: '{NAME}.md' },
  contextOptionsFn: () => ({ dependsOnContexts: ['${depLumpName}/${ctx}'] }),
  prompt: { promptTemplate: 'E2E @{NAME}', command: 'e2e-agent-${consumerLumpName}' },
  numberOfContextsPerBranch: 1,
};`,
                },
            ],
        });

        const blocked = await runE2eCli({ project, args: ['run', consumerLumpName, '--json'] });
        expectCliOk(blocked, 'blocked run');
        expectRunContextNames(blocked, []);

        seedFinishedContextOnMain({ projectRoot: project.projectRoot, lumpName: depLumpName, contextName: ctx });

        const run = await runE2eCli({ project, args: ['run', consumerLumpName, '--json'] });
        expectCliOk(run, 'run after dependency finished');
        expectRunContextNames(run, [ctx]);
        expect(remoteHasBranch({ remoteDir: project.remoteDir, branch: lumpBranchName(consumerLumpName, ctx) })).toBe(true);
        expectLumpMarkerCommit({ remoteDir: project.remoteDir, lumpName: consumerLumpName, contextName: ctx });
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName: consumerLumpName, contextName: ctx });
    });

    it('RUN-S5 maximum-open-branches-skip', async () => {
        const lumpName = 'myLump';
        const project = await createProject({
                lumps: [{ name: lumpName, maximumNumberOfConcurrentBranches: 1 }],
            });
        seedRemoteLumpBranch({ projectRoot: project.projectRoot, lumpName, contextName: 'seeded' });
        const run = await runE2eCli({ project, args: ['run', lumpName, '--json'] });
        expectCliOk(run, 'run');
        expectRunSkippedTooManyOpenBranches(run);
    });

    it.skipIf(process.platform !== 'win32')('RUN-S8 run-cmd-shim-agent-on-path', async () => {
        const lumpName = 'cmdLump';
        const ctx = 'README';
        const project = await createProject({
            lumps: [{ name: lumpName, useCmdShimAgent: true }],
        });
        expect(project.pathPrefix).toBeTruthy();
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run');
        expect(remoteHasBranch({ remoteDir: project.remoteDir, branch: lumpBranchName(lumpName, ctx) })).toBe(true);
        expectLumpMarkerCommit({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
    });
});
