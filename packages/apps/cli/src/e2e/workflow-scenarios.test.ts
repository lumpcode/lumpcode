import { describe, expect, it } from 'vitest';

import {
    expectCliOk,
    expectLumpMarkerCommit,
    expectMarkerOnRemote,
    lumpBranchName,
    remoteHasBranch,
    runE2eCli,
    runForegroundUntilMarkers,
    useE2eProjects,
} from './harness';

function workflowConfigTs(lumpName: string): string {
    const marker = JSON.stringify(`.lumpcode/e2e-markers/${lumpName}/`);
    return `export default {
  baseBranch: 'main',
  getContextListFn: () => [{ name: 'README', variables: {} }],
  numberOfContextsPerBranch: 1,
  async workflow({ context, shell }) {
    await shell({
      executable: process.execPath,
      args: ['-e', 'const fs=require("node:fs"); const path=require("node:path"); const file=process.env.MARKER; fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,"");'],
    }, { env: { MARKER: ${marker} + context.name + '.done' } });
    return { message: 'workflow-ran' };
  },
};
`;
}

describe('E2E workflow lump', () => {
    const { createProject } = useE2eProjects({ stopDaemonOnTeardown: true });

    function lump(name: string) {
        return {
            name,
            useE2eAgent: false,
            configTs: workflowConfigTs(name),
        };
    }

    it('WF-E1 run pushes the workflow branch', async () => {
        const lumpName = 'wfLump';
        const ctx = 'README';
        const project = await createProject({ lumps: [lump(lumpName)] });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run');
        expect(remoteHasBranch({ remoteDir: project.remoteDir, branch: lumpBranchName(lumpName, ctx) })).toBe(true);
        expectLumpMarkerCommit({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
    });

    it('WF-E2 one foreground daemon tick pushes the workflow branch', async () => {
        const lumpName = 'wfDaemon';
        const ctx = 'README';
        const project = await createProject({ lumps: [lump(lumpName)] });
        await runForegroundUntilMarkers({
            project,
            lumpName,
            waitFor: [{ lumpName, contextName: ctx }],
        });
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
        expectLumpMarkerCommit({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
    });
});
