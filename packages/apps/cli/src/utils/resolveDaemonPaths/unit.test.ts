import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveDaemonPaths } from './main';

type ResolveDaemonPaths = (input: {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    daemonId: string;
}) => Promise<
    | { success: true; data: { pidFilePath: string; logFilePath: string; metaFilePath: string; daemonId: string } }
    | { success: false; data: string }
>;

/**
 * daemon-id-and-filters P4–P6.
 * Skipped until resolveDaemonPaths takes required daemonId.
 */
describe.skip('resolveDaemonPaths (daemon-id-and-filters P*)', () => {
    let base: string;
    let projectRoot: string;
    let localConfigFolderPath: string;
    let globalConfigFolderPath: string;
    const resolve = resolveDaemonPaths as unknown as ResolveDaemonPaths;

    beforeEach(async () => {
        base = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-resolve-daemon-paths-'));
        projectRoot = path.join(base, 'repo');
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        globalConfigFolderPath = path.join(base, 'global');
        await fs.mkdir(localConfigFolderPath, { recursive: true });
        await fs.mkdir(globalConfigFolderPath, { recursive: true });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'demo' }),
            'utf-8',
        );
    });

    afterEach(async () => {
        await fs.rm(base, { recursive: true, force: true });
    });

    it('P4: write paths use project.daemonId.…', async () => {
        const result = await resolve({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            daemonId: 'global',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.pidFilePath).toMatch(/demo\.global\.daemon\.pid$/);
        expect(result.data.logFilePath).toMatch(/demo\.global\.daemon\.log$/);
        expect(result.data.metaFilePath).toMatch(/demo\.global\.daemon\.meta\.json$/);
        expect(result.data.daemonId).toBe('global');
        expect(result.data.pidFilePath).not.toMatch(/demo\.daemon\.pid$/);
    });

    it('P4: filtered daemonId paths', async () => {
        const result = await resolve({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            daemonId: 'agents',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.pidFilePath).toMatch(/demo\.agents\.daemon\.pid$/);
        expect(result.data.daemonId).toBe('agents');
    });

    it('P6: API uses daemonId (no lumpName omit=bare contract)', async () => {
        const result = await resolve({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            daemonId: 'global',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect('lumpName' in result.data).toBe(false);
        expect(result.data.daemonId).toBe('global');
    });
});
