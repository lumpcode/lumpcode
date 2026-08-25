import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PROJECT_JSON_FILE_NAME, readProjectJson } from './main';

/**
 * clean-local-project-json-config P* — skipped until readProjectJson lands.
 */
describe('readProjectJson (clean-local-project-json-config)', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-project-json-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    async function writeProject(payload: unknown) {
        await fs.writeFile(
            path.join(dir, PROJECT_JSON_FILE_NAME),
            typeof payload === 'string' ? payload : JSON.stringify(payload),
            'utf-8',
        );
    }

    it('P1: valid minimal projectName', async () => {
        await writeProject({ projectName: 'demo' });
        const result = await readProjectJson({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.projectName).toBe('demo');
    });

    it('P2: valid with shared + lump-default fields', async () => {
        await writeProject({
            projectName: 'demo',
            primaryBranch: 'dev',
            command: 'cursor',
            maximumNumberOfConcurrentBranches: 2,
            keepHistory: true,
        });
        const result = await readProjectJson({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toMatchObject({
            projectName: 'demo',
            primaryBranch: 'dev',
            command: 'cursor',
            maximumNumberOfConcurrentBranches: 2,
            keepHistory: true,
        });
        expect(result.data).not.toHaveProperty('mode');
        expect(result.data).not.toHaveProperty('verbose');
        expect(result.data).not.toHaveProperty('disabled');
        expect(result.data).not.toHaveProperty('maxParallelRun');
        expect(result.data).not.toHaveProperty('workspaceStrategy');
    });

    it('P3: missing file', async () => {
        const result = await readProjectJson({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/project\.json|project-setup/i);
    });

    it('P4: invalid JSON', async () => {
        await writeProject('not json');
        const result = await readProjectJson({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/Invalid JSON/i);
    });

    it('P5: missing / empty projectName', async () => {
        await writeProject({});
        const empty = await readProjectJson({ localConfigFolderPath: dir });
        expect(empty.success).toBe(false);

        await writeProject({ projectName: '  ' });
        const spaces = await readProjectJson({ localConfigFolderPath: dir });
        expect(spaces.success).toBe(false);
    });

    it('P6: invalid projectName chars', async () => {
        await writeProject({ projectName: 'My Project' });
        const result = await readProjectJson({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/projectName|letters|digits/i);
    });

    it('P7: unknown key', async () => {
        await writeProject({ projectName: 'x', foo: 1 });
        const result = await readProjectJson({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/foo|unrecognized|unknown|strict/i);
    });

    it('P8: misplaced mode', async () => {
        await writeProject({ projectName: 'x', mode: 'shared' });
        const result = await readProjectJson({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('mode');
    });

    it.each([
        { key: 'verbose', value: true },
        { key: 'disabled', value: true },
        { key: 'maxParallelRun', value: 2 },
        { key: 'workspaceStrategy', value: 'checkout' },
    ] as const)('P9: misplaced $key', async ({ key, value }) => {
        await writeProject({ projectName: 'x', [key]: value });
        const result = await readProjectJson({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain(key);
    });

    it('P10: path-shaped command', async () => {
        await writeProject({ projectName: 'x', command: './agent.ts' });
        const result = await readProjectJson({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/command|\.ts|\.js|path/i);
    });

    it('P11: tag command accepted without existence check', async () => {
        await writeProject({ projectName: 'x', command: 'cursor' });
        const result = await readProjectJson({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.command).toBe('cursor');
    });

    it('P12: keepHistory / cap type errors', async () => {
        await writeProject({ projectName: 'x', keepHistory: 'yes' });
        const keepHistory = await readProjectJson({ localConfigFolderPath: dir });
        expect(keepHistory.success).toBe(false);

        await writeProject({ projectName: 'x', maximumNumberOfConcurrentBranches: '2' });
        const cap = await readProjectJson({ localConfigFolderPath: dir });
        expect(cap.success).toBe(false);
    });

    it('P13: empty primaryBranches', async () => {
        await writeProject({ projectName: 'x', primaryBranches: [] });
        const result = await readProjectJson({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/empty|primaryBranches/i);
    });

    it('P14: duplicate primaryBranches', async () => {
        await writeProject({ projectName: 'x', primaryBranches: ['main', 'main'] });
        const result = await readProjectJson({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/duplicate/i);
    });

    describe('daemon-primary-branch-refresh-command P15–P16', () => {
        it('P15: accepts refreshCommand string', async () => {
            await writeProject({ projectName: 'demo', refreshCommand: 'npm i' });
            const result = await readProjectJson({ localConfigFolderPath: dir });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect((result.data as { refreshCommand?: string }).refreshCommand).toBe('npm i');
        });

        it('P16: empty refreshCommand fails', async () => {
            await writeProject({ projectName: 'demo', refreshCommand: '' });
            const result = await readProjectJson({ localConfigFolderPath: dir });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toMatch(/refreshCommand/i);
        });
    });
});
