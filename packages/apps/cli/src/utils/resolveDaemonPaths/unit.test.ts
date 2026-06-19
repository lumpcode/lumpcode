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

    it('uses global daemon file names when lumpName is omitted', async () => {
        const result = await resolveDaemonPaths({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.pidFilePath).toMatch(/demo_proj\.daemon\.pid$/);
        expect(result.data.logFilePath).toMatch(/demo_proj\.daemon\.log$/);
        expect(result.data.metaFilePath).toMatch(/demo_proj\.daemon\.meta\.json$/);
        expect(result.data.lumpName).toBeUndefined();
    });

    it('uses per-lump daemon file names when lumpName is set', async () => {
        const result = await resolveDaemonPaths({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            lumpName: 'alpha',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.pidFilePath).toMatch(/demo_proj\.alpha\.daemon\.pid$/);
        expect(result.data.logFilePath).toMatch(/demo_proj\.alpha\.daemon\.log$/);
        expect(result.data.metaFilePath).toMatch(/demo_proj\.alpha\.daemon\.meta\.json$/);
        expect(result.data.lumpName).toBe('alpha');
    });
});
