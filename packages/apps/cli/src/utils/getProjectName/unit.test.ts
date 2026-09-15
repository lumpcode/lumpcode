import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { execGit } from '../execGit';
import { initLocalGitRepo } from '../initLocalGitRepo';
import { writeJsonFile } from '../writeJsonFile';
import {
    getProjectName,
    isValidProjectName,
    resolveInferredProjectName,
    sanitizeInferredProjectName,
} from './main';

describe('getProjectName', () => {
    let base: string;
    let localConfig: string;
    let projectRoot: string;

    beforeEach(async () => {
        base = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-get-project-name-'));
        projectRoot = path.join(base, 'repo');
        localConfig = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(localConfig, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(base, { recursive: true, force: true });
    });

    it('returns trimmed valid projectName from project.json', async () => {
        await writeJsonFile({ filePath: path.join(localConfig, 'project.json'), data: { projectName: ' valid_name-1 ' } });
        const result = await getProjectName({ localConfigFolderPath: localConfig, projectRoot });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data).toBe('valid_name-1');
    });

    it('fails when project.json is missing', async () => {
        const result = await getProjectName({ localConfigFolderPath: localConfig, projectRoot });
        expect(result.success).toBe(false);
    });

    it('fails when projectName is missing or empty', async () => {
        await writeJsonFile({ filePath: path.join(localConfig, 'project.json'), data: {} });
        const empty = await getProjectName({ localConfigFolderPath: localConfig, projectRoot });
        expect(empty.success).toBe(false);

        await writeJsonFile({ filePath: path.join(localConfig, 'project.json'), data: { projectName: ' ' } });
        const spaces = await getProjectName({ localConfigFolderPath: localConfig, projectRoot });
        expect(spaces.success).toBe(false);
    });

    it('fails when projectName contains spaces or invalid characters', async () => {
        await writeJsonFile({ filePath: path.join(localConfig, 'project.json'), data: { projectName: 'My Project' } });
        const result = await getProjectName({ localConfigFolderPath: localConfig, projectRoot });
        expect(result.success).toBe(false);
    });

    /**
     * clean-local-project-json-config N* — skipped until getProjectName routes through readProjectJson.
     */
    describe('getProjectName strict membership (clean-local-project-json-config N*)', () => {
        it('N2: unknown key fails', async () => {
            await writeJsonFile({
                filePath: path.join(localConfig, 'project.json'),
                data: { projectName: 'x', foo: 1 },
            });
            const result = await getProjectName({ localConfigFolderPath: localConfig, projectRoot });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toMatch(/foo|unrecognized|unknown|strict/i);
        });

        it('N3: misplaced mode fails', async () => {
            await writeJsonFile({
                filePath: path.join(localConfig, 'project.json'),
                data: { projectName: 'x', mode: 'shared' },
            });
            const result = await getProjectName({ localConfigFolderPath: localConfig, projectRoot });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toContain('mode');
        });

        it('N4: path-shaped command fails', async () => {
            await writeJsonFile({
                filePath: path.join(localConfig, 'project.json'),
                data: { projectName: 'x', command: './agent.ts' },
            });
            const result = await getProjectName({ localConfigFolderPath: localConfig, projectRoot });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toMatch(/command|\.ts|path/i);
        });
    });
});

describe('isValidProjectName', () => {
    it('accepts letters, digits, underscore, hyphen', () => {
        expect(isValidProjectName('a')).toBe(true);
        expect(isValidProjectName('Ab_9-z')).toBe(true);
    });

    it('rejects empty and invalid characters', () => {
        expect(isValidProjectName('')).toBe(false);
        expect(isValidProjectName('a b')).toBe(false);
        expect(isValidProjectName('a.b')).toBe(false);
        expect(isValidProjectName('a/b')).toBe(false);
    });
});

describe('sanitizeInferredProjectName', () => {
    it('maps disallowed runs to single hyphens and trims edges', () => {
        expect(sanitizeInferredProjectName('  my  silly---name_ ')).toBe('my-silly-name_');
    });
});

describe('resolveInferredProjectName', () => {
    let projectRoot: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-infer-project-name-'));
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
    });

    it('returns trimmed explicitName when valid, ignoring origin', async () => {
        initLocalGitRepo({ cwd: projectRoot });
        execGit('remote add origin https://github.com/acme/from-origin.git', projectRoot);

        const result = await resolveInferredProjectName({
            projectRoot,
            explicitName: ' valid_name-1 ',
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data).toBe('valid_name-1');
    });

    it('fails with the existing invalid-name message', async () => {
        const result = await resolveInferredProjectName({
            projectRoot,
            explicitName: 'bad name',
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toBe(
            'projectName must contain only letters, digits, underscores (_), and hyphens (-). Spaces and other characters are not allowed.',
        );
    });

    it('infers from origin remote URL', async () => {
        initLocalGitRepo({ cwd: projectRoot });
        execGit('remote add origin https://github.com/acme/Hello_World.git', projectRoot);

        const result = await resolveInferredProjectName({ projectRoot });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data).toBe('Hello_World');
    });

    it('infers from directory basename when origin is absent', async () => {
        const nestedRoot = path.join(projectRoot, 'my silly app');
        await fs.mkdir(nestedRoot, { recursive: true });
        initLocalGitRepo({ cwd: nestedRoot });

        const result = await resolveInferredProjectName({
            projectRoot: nestedRoot,
            explicitName: '   ',
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data).toBe('my-silly-app');
    });

    it('fails with Pass --projectName when inferred name is unusable', async () => {
        const nestedRoot = path.join(projectRoot, '!!!');
        await fs.mkdir(nestedRoot, { recursive: true });

        const result = await resolveInferredProjectName({ projectRoot: nestedRoot });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toBe(
            'Could not derive a valid projectName from the git remote or directory name. Pass --projectName with only letters, digits, underscores, and hyphens.',
        );
    });
});
