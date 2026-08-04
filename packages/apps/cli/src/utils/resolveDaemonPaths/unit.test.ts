import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveDaemonPaths } from './main';

describe('resolveDaemonPaths', () => {
    let base: string;
    let projectRoot: string;
    let localConfigFolderPath: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        base = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-resolve-daemon-paths-'));
        projectRoot = path.join(base, 'repo');
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        globalConfigFolderPath = path.join(base, 'global');
        await fs.mkdir(localConfigFolderPath, { recursive: true });
        await fs.mkdir(globalConfigFolderPath, { recursive: true });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'demo_proj' }),
            'utf-8',
        );
    });

    afterEach(async () => {
        await fs.rm(base, { recursive: true, force: true });
    });

    it('uses project.daemonId paths for write', async () => {
        const result = await resolveDaemonPaths({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            daemonId: 'global',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.pidFilePath).toMatch(/demo_proj\.global\.daemon\.pid$/);
        expect(result.data.daemonId).toBe('global');
        expect(result.data.usedLegacyGlobalAlias).toBeUndefined();
    });

    it('falls back to legacy bare global when allowed and modern missing', async () => {
        const daemonsDir = path.join(globalConfigFolderPath, 'daemons');
        await fs.mkdir(daemonsDir, { recursive: true });
        await fs.writeFile(path.join(daemonsDir, 'demo_proj.daemon.pid'), '1', 'utf8');

        const result = await resolveDaemonPaths({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            daemonId: 'global',
            allowLegacyGlobalAlias: true,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.pidFilePath).toMatch(/demo_proj\.daemon\.pid$/);
        expect(result.data.usedLegacyGlobalAlias).toBe(true);
    });

    it('uses filtered daemon id path', async () => {
        const result = await resolveDaemonPaths({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            daemonId: 'alpha',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.pidFilePath).toMatch(/demo_proj\.alpha\.daemon\.pid$/);
        expect(result.data.daemonId).toBe('alpha');
    });
});
