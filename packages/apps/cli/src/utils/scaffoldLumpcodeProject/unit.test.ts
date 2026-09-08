import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initLocalGitRepo } from '../initLocalGitRepo';
import { scaffoldLumpcodeProject } from './main';

const GITIGNORE_LINES = [
    '.lumpcode/**/contextStatusRecord.json',
    '.lumpcode/**/history/',
    '.lumpcode/worktrees/',
    '.lumpcode/.cache/',
    '.lumpcode/local.json',
];

describe.skip('scaffoldLumpcodeProject (lumpcode-setup)', () => {
    let projectRoot: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-scaffold-'));
        initLocalGitRepo({ cwd: projectRoot });
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
    });

    it('creates .lumpcode layout, caller-supplied project.json + local.json, and gitignore lines', async () => {
        const result = await scaffoldLumpcodeProject({
            projectRoot,
            projectConfig: { projectName: 'my-app', primaryBranch: 'main' },
            localConfig: { mode: 'shared' },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.projectName).toBe('my-app');
        expect(result.data.projectRoot).toBe(projectRoot);

        const projectRaw = JSON.parse(
            await fs.readFile(path.join(projectRoot, '.lumpcode', 'project.json'), 'utf-8'),
        );
        expect(projectRaw).toEqual({ projectName: 'my-app', primaryBranch: 'main' });

        const localRaw = JSON.parse(
            await fs.readFile(path.join(projectRoot, '.lumpcode', 'local.json'), 'utf-8'),
        );
        expect(localRaw).toEqual({ mode: 'shared' });

        await Promise.all([
            fs.access(path.join(projectRoot, '.lumpcode', 'lumps')),
            fs.access(path.join(projectRoot, '.lumpcode', 'commands')),
        ]);

        const gitignore = await fs.readFile(path.join(projectRoot, '.gitignore'), 'utf-8');
        for (const line of GITIGNORE_LINES) {
            expect(gitignore).toContain(line);
        }
    });

    it('writes optional workspaceStrategy and maxParallelRun only when the caller supplies them', async () => {
        const withStrategy = await scaffoldLumpcodeProject({
            projectRoot,
            projectConfig: { projectName: 'w', primaryBranch: 'main' },
            localConfig: { mode: 'dedicated', workspaceStrategy: 'worktree', maxParallelRun: 3 },
        });
        expect(withStrategy.success).toBe(true);
        const localRaw = JSON.parse(
            await fs.readFile(path.join(projectRoot, '.lumpcode', 'local.json'), 'utf-8'),
        );
        expect(localRaw).toEqual({
            mode: 'dedicated',
            workspaceStrategy: 'worktree',
            maxParallelRun: 3,
        });
    });

    it('fails when .lumpcode/ already exists', async () => {
        const first = await scaffoldLumpcodeProject({
            projectRoot,
            projectConfig: { projectName: 'once', primaryBranch: 'main' },
            localConfig: { mode: 'shared' },
        });
        expect(first.success).toBe(true);

        const second = await scaffoldLumpcodeProject({
            projectRoot,
            projectConfig: { projectName: 'twice', primaryBranch: 'main' },
            localConfig: { mode: 'dedicated' },
        });
        expect(second.success).toBe(false);

        const projectRaw = JSON.parse(
            await fs.readFile(path.join(projectRoot, '.lumpcode', 'project.json'), 'utf-8'),
        );
        expect(projectRaw.projectName).toBe('once');
    });

    it('does not write command, keepHistory, verbose, refreshCommand, disabled, or primaryBranches', async () => {
        const result = await scaffoldLumpcodeProject({
            projectRoot,
            projectConfig: { projectName: 'clean', primaryBranch: 'main' },
            localConfig: { mode: 'shared' },
        });
        expect(result.success).toBe(true);
        const projectRaw = JSON.parse(
            await fs.readFile(path.join(projectRoot, '.lumpcode', 'project.json'), 'utf-8'),
        ) as Record<string, unknown>;
        const localRaw = JSON.parse(
            await fs.readFile(path.join(projectRoot, '.lumpcode', 'local.json'), 'utf-8'),
        ) as Record<string, unknown>;
        for (const key of ['command', 'keepHistory', 'verbose', 'refreshCommand', 'disabled', 'primaryBranches']) {
            expect(projectRaw[key]).toBeUndefined();
            expect(localRaw[key]).toBeUndefined();
        }
    });
});
