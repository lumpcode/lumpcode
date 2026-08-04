import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

    it('defaults to daemonId global', async () => {
        const result = await resolveDaemonCommandScope({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.daemonId).toBe('global');
        expect(result.data.scopeLabel).toBe('');
        expect(result.data.paths.pidFilePath).toMatch(/demo_proj\.global\.daemon\.pid$/);
    });

    it('uses --daemonId', async () => {
        const result = await resolveDaemonCommandScope({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            daemonId: '  alpha  ',
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.daemonId).toBe('alpha');
        expect(result.data.scopeLabel).toBe(' daemon "alpha"');
    });

    it('maps deprecated --lumpName to daemonId with warning', async () => {
        const warn = vi.fn();
        const result = await resolveDaemonCommandScope({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            lumpName: 'alpha',
            logger: { warn, info: () => {}, error: () => {}, verbose: () => {}, child: () => ({}) } as never,
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.daemonId).toBe('alpha');
        expect(warn).toHaveBeenCalled();
    });

    it('fails when both daemonId and lumpName are set', async () => {
        const result = await resolveDaemonCommandScope({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            daemonId: 'a',
            lumpName: 'b',
        });
        expect(result.success).toBe(false);
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
