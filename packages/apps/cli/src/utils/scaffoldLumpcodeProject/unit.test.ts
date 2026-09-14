import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { scaffoldLumpcodeProject } from './main';

const GITIGNORE_LINES = [
    '.lumpcode/**/contextStatusRecord.json',
    '.lumpcode/**/history/',
    '.lumpcode/worktrees/',
    '.lumpcode/.cache/',
    '.lumpcode/local.json',
];

/**
 * scaffold-lumpcode-project — skipped until scaffoldLumpcodeProject lands.
 */
describe.skip('scaffoldLumpcodeProject', () => {
    let projectRoot: string;

    beforeEach(async () => {
        const dirs = await createTempTestDirs({
            prefix: 'lump-scaffold-',
            remote: false,
            global: false,
            mkdirLocalConfig: false,
        });
        projectRoot = dirs.projectRoot;
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot });
    });

    it('writes a fresh .lumpcode tree with mode-only local.json and the five gitignore lines', async () => {
        const result = await scaffoldLumpcodeProject({
            projectRoot,
            project: { projectName: 'my-app', primaryBranch: 'main' },
            local: { mode: 'shared' },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        const lumpcodeDir = path.join(projectRoot, '.lumpcode');
        expect(result.data).toEqual({ lumpcodeDir });

        await Promise.all([
            fs.access(path.join(lumpcodeDir, 'lumps')),
            fs.access(path.join(lumpcodeDir, 'commands')),
        ]);

        const projectRaw = await fs.readFile(path.join(lumpcodeDir, 'project.json'), 'utf-8');
        expect(projectRaw).toBe(`${JSON.stringify({ projectName: 'my-app', primaryBranch: 'main' }, null, 2)}\n`);

        const localRaw = await fs.readFile(path.join(lumpcodeDir, 'local.json'), 'utf-8');
        expect(localRaw).toBe(`${JSON.stringify({ mode: 'shared' }, null, 2)}\n`);

        const gitignore = await fs.readFile(path.join(projectRoot, '.gitignore'), 'utf-8');
        expect(gitignore).toBe(`${GITIGNORE_LINES.join('\n')}\n`);
    });

    it('fails when .lumpcode already exists', async () => {
        const first = await scaffoldLumpcodeProject({
            projectRoot,
            project: { projectName: 'my-app', primaryBranch: 'main' },
            local: { mode: 'shared' },
        });
        expect(first.success).toBe(true);

        const second = await scaffoldLumpcodeProject({
            projectRoot,
            project: { projectName: 'other', primaryBranch: 'develop' },
            local: { mode: 'dedicated', workspaceStrategy: 'worktree' },
        });
        expect(second.success).toBe(false);
        if (second.success) throw new Error('unreachable');
        expect(second.data).toContain(`A Lumpcode project already exists at ${path.join(projectRoot, '.lumpcode')}`);

        const projectRaw = await fs.readFile(path.join(projectRoot, '.lumpcode', 'project.json'), 'utf-8');
        expect(JSON.parse(projectRaw)).toEqual({ projectName: 'my-app', primaryBranch: 'main' });
    });

    it('writes workspaceStrategy only when the caller passed it', async () => {
        const result = await scaffoldLumpcodeProject({
            projectRoot,
            project: { projectName: 'my-app', primaryBranch: 'develop' },
            local: { mode: 'dedicated', workspaceStrategy: 'worktree' },
        });
        expect(result.success).toBe(true);

        const localRaw = await fs.readFile(path.join(projectRoot, '.lumpcode', 'local.json'), 'utf-8');
        expect(JSON.parse(localRaw)).toEqual({ mode: 'dedicated', workspaceStrategy: 'worktree' });
    });

    it('writes maxParallelRun only when the caller passed a value other than 1', async () => {
        const written = await scaffoldLumpcodeProject({
            projectRoot,
            project: { projectName: 'my-app', primaryBranch: 'main' },
            local: { mode: 'dedicated', maxParallelRun: 2 },
        });
        expect(written.success).toBe(true);
        const writtenRaw = await fs.readFile(path.join(projectRoot, '.lumpcode', 'local.json'), 'utf-8');
        expect(JSON.parse(writtenRaw)).toEqual({ mode: 'dedicated', maxParallelRun: 2 });

        const omittedDirs = await createTempTestDirs({
            prefix: 'lump-scaffold-mpr1-',
            remote: false,
            global: false,
            mkdirLocalConfig: false,
        });
        try {
            const omitted = await scaffoldLumpcodeProject({
                projectRoot: omittedDirs.projectRoot,
                project: { projectName: 'my-app', primaryBranch: 'main' },
                local: { mode: 'shared', maxParallelRun: 1 },
            });
            expect(omitted.success).toBe(true);
            const omittedRaw = await fs.readFile(
                path.join(omittedDirs.projectRoot, '.lumpcode', 'local.json'),
                'utf-8',
            );
            expect(JSON.parse(omittedRaw)).toEqual({ mode: 'shared' });
        } finally {
            await removeTempTestDirs({ projectRoot: omittedDirs.projectRoot });
        }
    });
});
