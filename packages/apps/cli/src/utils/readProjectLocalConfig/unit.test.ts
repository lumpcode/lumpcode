import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import type * as z from 'zod';

import type { LocalJsonConfig } from '../../types/LocalJsonConfig';
import type { ProjectJsonConfig } from '../../types/ProjectJsonConfig';
import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import { LOCAL_CONFIG_FILE_NAME } from '../readLocalConfig';
import { PROJECT_JSON_FILE_NAME } from '../readProjectJson';
import { resolvePrimaryBranches } from '../resolvePrimaryBranches';
import { writeJsonFile } from '../writeJsonFile';
import { readProjectLocalConfig, resolvedProjectLocalConfigSchema } from './main';

/**
 * clean-local-project-json-config M* / T* — skipped until merge + Zod land.
 */
describe('readProjectLocalConfig (clean-local-project-json-config)', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-project-local-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    async function writePair(project: unknown, local: unknown) {
        await writeJsonFile({ filePath: path.join(dir, PROJECT_JSON_FILE_NAME), data: project });
        await writeJsonFile({ filePath: path.join(dir, LOCAL_CONFIG_FILE_NAME), data: local });
    }

    it('M1: local wins shared primaryBranch', async () => {
        await writePair(
            { projectName: 'demo', primaryBranch: 'dev' },
            { mode: 'dedicated', primaryBranch: 'main' },
        );
        const result = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.primaryBranch).toBe('main');
    });

    it('M2: primary only on project', async () => {
        await writePair({ projectName: 'demo', primaryBranch: 'dev' }, { mode: 'shared' });
        const result = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.primaryBranch).toBe('dev');
        expect(result.data.mode).toBe('shared');
    });

    it('M3: primary only on local', async () => {
        await writePair({ projectName: 'demo' }, { mode: 'dedicated', primaryBranch: 'main' });
        const result = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.primaryBranch).toBe('main');
    });

    it('M4: primary missing on both fails naming both files', async () => {
        await writePair({ projectName: 'demo' }, { mode: 'shared' });
        const result = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/project\.json/i);
        expect(result.data).toMatch(/local\.json/i);
        expect(result.data).toMatch(/primaryBranch|primaryBranches/i);
    });

    it('M5: workspaceStrategy defaults to checkout when omitted', async () => {
        await writePair({ projectName: 'demo', primaryBranch: 'main' }, { mode: 'shared' });
        const result = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.workspaceStrategy).toBe('checkout');
    });

    it('M6: local workspaceStrategy wins', async () => {
        await writePair(
            { projectName: 'demo', primaryBranch: 'main' },
            { mode: 'dedicated', workspaceStrategy: 'worktree' },
        );
        const result = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.workspaceStrategy).toBe('worktree');
    });

    it('M7: local wins shared lump-default command', async () => {
        await writePair(
            { projectName: 'demo', primaryBranch: 'main', command: 'cursor' },
            { mode: 'shared', command: 'copilot' },
        );
        const result = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.command).toBe('copilot');
    });

    it('M8: projectName always from project', async () => {
        await writePair({ projectName: 'from-project', primaryBranch: 'main' }, { mode: 'shared' });
        const result = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.projectName).toBe('from-project');
    });

    it('M9: local-only fields present from local', async () => {
        await writePair(
            { projectName: 'demo', primaryBranch: 'main' },
            {
                mode: 'dedicated',
                disabled: true,
                maxParallelRun: 3,
            },
        );
        const result = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.mode).toBe('dedicated');
        expect(result.data.disabled).toBe(true);
        expect(result.data.maxParallelRun).toBe(3);
    });

    it('M10: propagates underlying file Failure', async () => {
        await writePair({ projectName: 'x', mode: 'shared' }, { mode: 'shared', primaryBranch: 'main' });
        const badProject = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(badProject.success).toBe(false);
        if (badProject.success) throw new Error('unreachable');
        expect(badProject.data).toContain('mode');

        await writePair({ projectName: 'demo', primaryBranch: 'main' }, { mode: 'shared', projectName: 'nope' });
        const badLocal = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(badLocal.success).toBe(false);
        if (badLocal.success) throw new Error('unreachable');
        expect(badLocal.data).toContain('projectName');
    });

    it('M11: deprecated projectBaseBranch only on project is merge-ok', async () => {
        await writePair({ projectName: 'demo', projectBaseBranch: 'legacy' }, { mode: 'shared' });
        const result = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(resolvePrimaryBranches(result.data)).toEqual(['legacy']);
    });

    it('M12: per-key local wins (singular local replaces; array from project omitted when local sets singular only)', async () => {
        await writePair(
            {
                projectName: 'demo',
                primaryBranches: ['dev', 'main'],
            },
            {
                mode: 'dedicated',
                primaryBranch: 'main',
            },
        );
        const result = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.primaryBranch).toBe('main');
        // Per-key merge: local did not set primaryBranches, so project's array remains
        // unless implementation treats primary as a group — assert per-key local-wins:
        // local singular present; project's array still present when local omitted that key.
        expect(result.data.primaryBranches).toEqual(['dev', 'main']);
        // resolvePrimaryBranches: non-empty array wins over singular
        expect(resolvePrimaryBranches(result.data)).toEqual(['dev', 'main']);
    });
});

/**
 * daemon-primary-branch-refresh-command M13–M16.
 * Skipped until merge includes refreshCommand (local wins).
 */
describe('readProjectLocalConfig refreshCommand (daemon-primary-branch-refresh-command M*)', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-project-local-refresh-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    async function writePair(project: unknown, local: unknown) {
        await writeJsonFile({ filePath: path.join(dir, PROJECT_JSON_FILE_NAME), data: project });
        await writeJsonFile({ filePath: path.join(dir, LOCAL_CONFIG_FILE_NAME), data: local });
    }

    it('M13: local wins refreshCommand', async () => {
        await writePair(
            { projectName: 'demo', primaryBranch: 'main', refreshCommand: 'npm i' },
            { mode: 'dedicated', refreshCommand: 'npm ci' },
        );
        const result = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect((result.data as { refreshCommand?: string }).refreshCommand).toBe('npm ci');
    });

    it('M14: project-only refreshCommand', async () => {
        await writePair(
            { projectName: 'demo', primaryBranch: 'main', refreshCommand: 'npm i' },
            { mode: 'dedicated' },
        );
        const result = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect((result.data as { refreshCommand?: string }).refreshCommand).toBe('npm i');
    });

    it('M15: local-only refreshCommand', async () => {
        await writePair(
            { projectName: 'demo', primaryBranch: 'main' },
            { mode: 'dedicated', refreshCommand: 'npm i' },
        );
        const result = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect((result.data as { refreshCommand?: string }).refreshCommand).toBe('npm i');
    });

    it('M16: empty refreshCommand on either file fails', async () => {
        await writePair(
            { projectName: 'demo', primaryBranch: 'main', refreshCommand: '' },
            { mode: 'dedicated' },
        );
        const fromProject = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(fromProject.success).toBe(false);

        await writePair(
            { projectName: 'demo', primaryBranch: 'main' },
            { mode: 'dedicated', refreshCommand: '' },
        );
        const fromLocal = await readProjectLocalConfig({ localConfigFolderPath: dir });
        expect(fromLocal.success).toBe(false);
        if (fromLocal.success) throw new Error('unreachable');
        expect(fromLocal.data).toMatch(/refreshCommand/i);
    });
});

describe('ResolvedProjectLocalConfig types (clean-local-project-json-config T*)', () => {
    it('T1: ResolvedProjectLocalConfig equals z.infer of resolved schema', () => {
        expectTypeOf<ResolvedProjectLocalConfig>().toEqualTypeOf<
            z.infer<typeof resolvedProjectLocalConfigSchema>
        >();
    });

    it('T2: ProjectJsonConfig / LocalJsonConfig Pick shared field types stay identical', () => {
        type SharedProject = Pick<ProjectJsonConfig, 'primaryBranch' | 'command'>;
        type SharedLocal = Pick<LocalJsonConfig, 'primaryBranch' | 'command'>;
        expectTypeOf<SharedProject>().toEqualTypeOf<SharedLocal>();

        type CapProject = ProjectJsonConfig['maximumNumberOfConcurrentBranches'];
        type CapLocal = LocalJsonConfig['maximumNumberOfConcurrentBranches'];
        expectTypeOf<CapProject>().toEqualTypeOf<CapLocal>();
    });

    it('T3: LocalConfig / ProjectConfig align with new file shapes', () => {
        type LocalConfig = import('../../types').LocalConfig;
        type ProjectConfig = import('../../types').ProjectConfig;
        // After implementation: prefer type-alias LocalConfig = LocalJsonConfig.
        expectTypeOf<LocalConfig>().toMatchTypeOf<LocalJsonConfig>();
        expectTypeOf<ProjectConfig>().toMatchTypeOf<Partial<ProjectJsonConfig>>();
    });
});
