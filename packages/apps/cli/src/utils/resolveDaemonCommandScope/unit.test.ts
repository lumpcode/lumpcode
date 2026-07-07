import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveDaemonCommandScope } from './main';

describe('resolveDaemonCommandScope', () => {
    let base: string;
    let projectRoot: string;
    let localConfigFolderPath: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        base = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-daemon-command-scope-'));
        projectRoot = path.join(base, 'repo');
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        globalConfigFolderPath = path.join(base, 'global');
        await fs.mkdir(path.join(projectRoot, '.git'), { recursive: true });
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

    it('returns scoped daemon paths and an empty scopeLabel for the global daemon', async () => {
        const result = await resolveDaemonCommandScope({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.scopeLabel).toBe('');
        expect(result.data.paths.pidFilePath).toMatch(/demo_proj\.daemon\.pid$/);
    });

    it('trims lumpName and builds scopeLabel for a per-lump daemon', async () => {
        const result = await resolveDaemonCommandScope({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            lumpName: '  alpha  ',
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.lumpName).toBe('alpha');
        expect(result.data.scopeLabel).toBe(' lump "alpha"');
        expect(result.data.paths.lumpName).toBe('alpha');
    });

    it('returns commandFailure when the cwd is not a Lumpcode project root', async () => {
        const result = await resolveDaemonCommandScope({
            projectRoot: base,
            localConfigFolderPath: path.join(base, '.lumpcode'),
            globalConfigFolderPath,
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('Not a Lumpcode project root');
    });
});
