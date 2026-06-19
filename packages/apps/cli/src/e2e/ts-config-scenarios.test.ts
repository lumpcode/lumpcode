import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { readCacheMeta } from '../testing/tsLumpFixtures';
import {
    defaultE2eTsLumpConfig,
    expectCliOk,
    expectLumpMarkerCommit,
    expectLumpStatus,
    expectMarkerOnRemote,
    lumpBranchName,
    remoteBranchFileContent,
    remoteHasBranch,
    runE2eCli,
    useE2eProjects,
} from './harness';

describe('E2E TypeScript config scenarios', () => {
    const { createProject } = useE2eProjects();

    it('TS-S1 minimal config.ts with preset agent', async () => {
        const lumpName = 'tsLump';
        const ctx = 'README';
        const project = await createProject({
            lumps: [{ name: lumpName, configTs: defaultE2eTsLumpConfig() }],
        });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run');
        expect(remoteHasBranch({ remoteDir: project.remoteDir, branch: lumpBranchName(lumpName, ctx) })).toBe(true);
        expectLumpMarkerCommit({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
    });

    it('TS-S2 config.ts with file getContextList.ts hook', async () => {
        const lumpName = 'tsHookLump';
        const ctx = 'fromHook';
        const project = await createProject({
            lumps: [{
                name: lumpName,
                configTs: `export default {
  getContextListFn: './getContextList.ts',
  prompt: { promptTemplate: 'E2E @{NAME}', command: 'e2e-agent' },
  numberOfContextsPerBranch: 1,
};`,
                hookFiles: {
                    'getContextList.ts': `export default function getContextListFn() {
  return [{ name: 'fromHook', variables: { NAME: 'fromHook' } }];
}`,
                },
            }],
        });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run');
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
    });

    it('TS-S3 config.json with setup.ts hook only', async () => {
        const lumpName = 'jsonTsHookLump';
        const ctx = 'README';
        const project = await createProject({
            lumps: [{
                name: lumpName,
                configJson: {
                    contextListJson: { NAME: '{NAME}.md' },
                    setupFn: './setup.ts',
                    prompt: { promptTemplate: 'E2E @{NAME}', command: 'e2e-agent' },
                    numberOfContextsPerBranch: 1,
                },
                hookFiles: {
                    'setup.ts': `export default function setup() {
  return { contextRunState: { jsonTsHook: true } };
}`,
                },
            }],
        });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run');
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
    });

    it('TS-S4 custom .ts command module in .lumpcode/commands/', async () => {
        const lumpName = 'tsCmdLump';
        const ctx = 'README';
        const commandModule = 'e2e-ts-agent';
        const project = await createProject({
            lumps: [{
                name: lumpName,
                e2eCommandModule: commandModule,
                e2eCommandModuleExt: 'ts',
                configTs: defaultE2eTsLumpConfig({ command: commandModule }),
            }],
        });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run');
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
    });

    it('TS-S5 config.ts wins over coexisting config.js', async () => {
        const lumpName = 'tsWinsLump';
        const ctx = 'README';
        const markerFile = `.lumpcode/e2e-markers/${lumpName}/ts-wins.txt`;
        const project = await createProject({
            lumps: [{
                name: lumpName,
                configTs: `export default {
  contextListJson: { NAME: '{NAME}.md' },
  setupFn: './tsSetup.ts',
  prompt: { promptTemplate: 'E2E @{NAME}', command: 'e2e-agent' },
  numberOfContextsPerBranch: 1,
};`,
                hookFiles: {
                    'tsSetup.ts': `import fs from 'node:fs';
export default function setup() {
  fs.mkdirSync('.lumpcode/e2e-markers/${lumpName}', { recursive: true });
  fs.writeFileSync('${markerFile}', 'from-ts');
  return { contextRunState: {} };
}`,
                },
            }],
        });
        const lumpDir = path.join(project.projectRoot, '.lumpcode', 'lumps', lumpName);
        await fs.writeFile(
            path.join(lumpDir, 'jsSetup.js'),
            `import fs from 'node:fs';
export default function setup() {
  fs.writeFileSync('${markerFile}', 'from-js');
  return { contextRunState: {} };
}`,
            'utf-8',
        );
        await fs.writeFile(
            path.join(lumpDir, 'config.js'),
            `export default {
  contextListJson: { NAME: '{NAME}.md' },
  setupFn: './jsSetup.js',
  prompt: { promptTemplate: 'E2E @{NAME}', command: 'e2e-agent' },
  numberOfContextsPerBranch: 1,
};`,
            'utf-8',
        );

        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run');
        const branch = lumpBranchName(lumpName, ctx);
        const content = remoteBranchFileContent({
            remoteDir: project.remoteDir,
            branch,
            filePath: markerFile,
        });
        expect(content).toBe('from-ts');
    });

    it('TS-S6 lump-plan with config.ts returns valid plan envelope', async () => {
        const lumpName = 'tsPlanLump';
        const project = await createProject({
            lumps: [{ name: lumpName, configTs: defaultE2eTsLumpConfig() }],
        });
        const plan = await runE2eCli({ project, args: ['lump-plan', lumpName, '--json'] });
        expectCliOk(plan, 'lump-plan');
        expect(plan.json.data?.valid).toBe(true);
    });

    it('TS-S7 transpile cache reuse across two runs', async () => {
        const lumpName = 'tsCacheLump';
        const ctx = 'README';
        const project = await createProject({
            lumps: [{ name: lumpName, configTs: defaultE2eTsLumpConfig() }],
        });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'first run');
        expect((await readCacheMeta(project.projectRoot)).length).toBeGreaterThan(0);
        const second = await runE2eCli({ project, args: ['run', lumpName, '--json'] });
        expectCliOk(second, 'second run');
        expectMarkerOnRemote({ remoteDir: project.remoteDir, lumpName, contextName: ctx });
    });

    it('TS-S9 lump-status after TS run reports branchPushed', async () => {
        const lumpName = 'tsStatusLump';
        const ctx = 'README';
        const project = await createProject({
            lumps: [{ name: lumpName, configTs: defaultE2eTsLumpConfig() }],
        });
        expectCliOk(await runE2eCli({ project, args: ['run', lumpName, '--json'] }), 'run');
        const status = await runE2eCli({ project, args: ['lump-status', '--lumpName', lumpName, '--json'] });
        expectCliOk(status, 'status');
        expectLumpStatus(status, { lumpName, contextName: ctx, status: 'branchPushed' });
    });

    it('TS-S10 project-setup gitignores transpile cache', async () => {
        const project = await createProject({ lumps: [{ name: 'unused' }] });
        await fs.rm(path.join(project.projectRoot, '.lumpcode'), { recursive: true, force: true });

        const setup = await runE2eCli({
            project,
            args: ['project-setup', '--projectName', 'ts-setup-e2e'],
        });
        expectCliOk(setup, 'project-setup');
        const gitignore = await fs.readFile(path.join(project.projectRoot, '.gitignore'), 'utf-8');
        expect(gitignore).toContain('.lumpcode/.cache/');
    });
});
