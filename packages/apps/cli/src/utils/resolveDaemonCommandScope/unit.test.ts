import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveDaemonCommandScope } from './main';

type ScopeInput = {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    daemonId?: string;
    lumpName?: string;
};

type ScopeResult =
    | {
          success: true;
          data: {
              daemonId: string;
              scopeLabel: string;
              paths: { pidFilePath: string; daemonId?: string };
          };
      }
    | { success: false; data: { messages: string[] } };

type ScopeFn = (input: ScopeInput) => Promise<ScopeResult>;

/**
 * daemon-id-and-filters C1–C4.
 * Skipped until resolveDaemonCommandScope uses --daemonId / default global.
 */
describe('resolveDaemonCommandScope (daemon-id-and-filters C*)', () => {
    let base: string;
    let projectRoot: string;
    let localConfigFolderPath: string;
    let globalConfigFolderPath: string;
    const resolve = resolveDaemonCommandScope as unknown as ScopeFn;

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

    it('C1: default → daemonId global + new paths', async () => {
        const result = await resolve({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.daemonId).toBe('global');
        expect(result.data.paths.pidFilePath).toMatch(/demo_proj\.global\.daemon\.pid$/);
    });

    it('C2: --daemonId → paths for that id', async () => {
        const result = await resolve({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            daemonId: 'agents',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.daemonId).toBe('agents');
        expect(result.data.paths.pidFilePath).toMatch(/demo_proj\.agents\.daemon\.pid$/);
    });

    it('C3: deprecated --lumpName → treat as daemonId', async () => {
        const result = await resolve({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            lumpName: '  alpha  ',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.daemonId).toBe('alpha');
        expect(result.data.paths.pidFilePath).toMatch(/demo_proj\.alpha\.daemon\.pid$/);
    });

    it('C4: both daemonId and lumpName → failure', async () => {
        const result = await resolve({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            daemonId: 'agents',
            lumpName: 'alpha',
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/daemonId|lumpName|together|mutually|both/i);
    });

    it('still fails when cwd is not a Lumpcode project root', async () => {
        const result = await resolve({
            projectRoot: base,
            localConfigFolderPath: path.join(base, '.lumpcode'),
            globalConfigFolderPath,
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('Not a Lumpcode project root');
    });
});
