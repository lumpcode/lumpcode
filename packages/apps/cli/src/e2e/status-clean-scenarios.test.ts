import * as fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { contextStatusRecordPath } from '../utils/contextStatusRecordPath';
import {
    expectCliOk,
    expectLumpStatus,
    listRemoteLumpBranches,
    lumpBranchName,
    remoteHasBranch,
    runE2eCli,
    useE2eProjects,
} from './harness';

describe('E2E status and clean', () => {
    const { createProject } = useE2eProjects();

    it('STATUS-CLEAN-S1 lump-status-after-run', async () => {
        const lumpName = 'myLump';
        const ctx = 'README';
        const project = await createProject({ lumps: [{ name: lumpName }] });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run');
        const status = await runE2eCli({ project, args: ['lump-status', '--lumpName', lumpName, '--json'] });
        expectCliOk(status, 'status');
        expectLumpStatus(status, { lumpName, contextName: ctx, status: 'branchPushed' });
        const onDisk = JSON.parse(
            await fs.readFile(contextStatusRecordPath({ projectRoot: project.projectRoot, lumpName }), 'utf-8'),
        );
        expect(onDisk[ctx].status).toBe('branchPushed');
    });

    it('STATUS-CLEAN-S2 clean-after-run', async () => {
        const lumpName = 'myLump';
        const project = await createProject({ lumps: [{ name: lumpName }] });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run');
        expectCliOk(await runE2eCli({ project, args: ['clean', '--lumpName', lumpName, '--json'] }), 'clean');
        expect(listRemoteLumpBranches(project.remoteDir, lumpName)).toEqual([]);
    });

    it('STATUS-CLEAN-S3 clean-scoped', async () => {
        const lumpName = 'myLump';
        const project = await createProject({
                lumps: [{ name: lumpName }],
                extraFiles: { 'OTHER.md': '# b\n' },
            });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run1');
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run2');
        expectCliOk(
            await runE2eCli({ project, args: ['clean', '--lumpName', lumpName, '--contextName', 'README', '--json'] }),
            'clean',
        );
        expect(remoteHasBranch({ remoteDir: project.remoteDir, branch: lumpBranchName(lumpName, 'README') })).toBe(
            false,
        );
        expect(remoteHasBranch({ remoteDir: project.remoteDir, branch: lumpBranchName(lumpName, 'OTHER') })).toBe(
            true,
        );
    });
});
