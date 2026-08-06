import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    expectCliOk,
    expectMarkerOnRemote,
    expectRunContextNames,
    lumpBranchName,
    remoteHasBranch,
    runE2eCli,
    useE2eProjects,
} from './harness';

/**
 * clean-local-project-json-config E* — skipped until scaffold + inherited command land.
 */
describe('E2E project/local config (clean-local-project-json-config)', () => {
    const { createProject } = useE2eProjects();

    it('E1: fresh project-setup writes project primary + mode-only local', async () => {
        const project = await createProject({ lumps: [{ name: 'unused' }] });
        await fs.rm(path.join(project.projectRoot, '.lumpcode'), { recursive: true, force: true });

        const setup = await runE2eCli({
            project,
            args: [
                'project-setup',
                '--projectName',
                'e2e-clean',
                '--mode',
                'shared',
                '--primaryBranch',
                'main',
            ],
        });
        expectCliOk(setup, 'project-setup');

        const projectRaw = await fs.readFile(
            path.join(project.projectRoot, '.lumpcode', 'project.json'),
            'utf-8',
        );
        expect(JSON.parse(projectRaw)).toEqual({
            projectName: 'e2e-clean',
            primaryBranch: 'main',
        });

        const localRaw = await fs.readFile(
            path.join(project.projectRoot, '.lumpcode', 'local.json'),
            'utf-8',
        );
        expect(JSON.parse(localRaw)).toEqual({ mode: 'shared' });
    });

    it('E2: run inherits command from project.json when lump omits it', async () => {
        const lumpName = 'inheritCmd';
        const ctx = 'README';
        const project = await createProject({
            projectName: 'e2e-inherit-cmd',
            projectJson: { command: 'e2e-agent' },
            lumps: [
                {
                    name: lumpName,
                    // configJs omits top-level command so project/local default applies after overlay.
                    configJs: `export default {
  contextListJson: { NAME: '{NAME}.md' },
  prompt: { promptTemplate: 'E2E @{NAME}' },
  numberOfContextsPerBranch: 1,
};
`,
                    useE2eAgent: true,
                },
            ],
        });

        const projectJson = JSON.parse(
            await fs.readFile(path.join(project.projectRoot, '.lumpcode', 'project.json'), 'utf-8'),
        ) as { command?: string };
        expect(projectJson.command).toBe('e2e-agent');

        const run = await runE2eCli({ project, args: ['run', lumpName, '--json'] });
        expectCliOk(run, 'run');
        expectRunContextNames(run, [ctx]);
        expect(remoteHasBranch({ remoteDir: project.remoteDir, branch: lumpBranchName(lumpName, ctx) })).toBe(
            true,
        );
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
    });
});
