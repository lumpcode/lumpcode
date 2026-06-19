import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getProjectName, isValidProjectName, sanitizeInferredProjectName } from './main';

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
        await fs.writeFile(
            path.join(localConfig, 'project.json'),
            JSON.stringify({ projectName: '  valid_name-1  ' }),
            'utf-8',
        );
        const result = await getProjectName({ localConfigFolderPath: localConfig, projectRoot });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data).toBe('valid_name-1');
    });

    it('fails when project.json is missing', async () => {
        const result = await getProjectName({ localConfigFolderPath: localConfig, projectRoot });
        expect(result.success).toBe(false);
    });

    it('fails when projectName is missing or empty', async () => {
        await fs.writeFile(path.join(localConfig, 'project.json'), JSON.stringify({}), 'utf-8');
        const empty = await getProjectName({ localConfigFolderPath: localConfig, projectRoot });
        expect(empty.success).toBe(false);

        await fs.writeFile(
            path.join(localConfig, 'project.json'),
            JSON.stringify({ projectName: '   ' }),
            'utf-8',
        );
        const spaces = await getProjectName({ localConfigFolderPath: localConfig, projectRoot });
        expect(spaces.success).toBe(false);
    });

    it('fails when projectName contains spaces or invalid characters', async () => {
        await fs.writeFile(
            path.join(localConfig, 'project.json'),
            JSON.stringify({ projectName: 'My Project' }),
            'utf-8',
        );
        const result = await getProjectName({ localConfigFolderPath: localConfig, projectRoot });
        expect(result.success).toBe(false);
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
