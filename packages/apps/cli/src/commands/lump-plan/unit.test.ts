import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { LUMP_PLAN_COMMAND_CONFIG_TS } from '../../testing/tsLumpFixtures';
import { command } from './main';
import * as runProjectPreflightModule from '../../utils/runProjectPreflight';
import { gitCurrentBranch } from '../../testing';

const LUMP_CONFIG_JS = `export default {
  getContextListFn: () => [{ name: 'alpha', variables: {} }],
  prompt: {
    promptFn: () => 'hello',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};
`;

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

describe('lump-plan command', () => {
    let projectRoot: string;
    let localConfigFolderPath: string;
    const globalConfigFolderPath = path.join(os.homedir(), '.lumpcode-test-plan-global');

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-plan-cmd-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'my-lump'), { recursive: true });
        await fs.mkdir(globalConfigFolderPath, { recursive: true });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'dedicated', discoveryBranch: 'main' }),
            'utf-8',
        );
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'plan-cmd-test' }),
            'utf-8',
        );

        git('init -b main', projectRoot);
        git('config user.email "test@test.com"', projectRoot);
        git('config user.name "Test"', projectRoot);
        git('commit --allow-empty -m "init"', projectRoot);

        await fs.writeFile(
            path.join(localConfigFolderPath, 'lumps', 'my-lump', 'config.js'),
            LUMP_CONFIG_JS,
            'utf-8',
        );
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
    });

    function makeHandler() {
        return command.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
    }

    it('succeeds with validate-only by default', async () => {
        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'my-lump' },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data?.valid).toBe(true);
        expect(result.data.messages.some((m) => m.includes('valid'))).toBe(true);
    });

    it('returns contexts with --contexts --json', async () => {
        const result = await makeHandler()({
            options: { contexts: true, json: true },
            arguments: { lumpName: 'my-lump' },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data?.contexts?.[0].name).toBe('alpha');
    });

    it('fails when lump config is missing', async () => {
        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'missing-lump' },
        });
        expect(result.success).toBe(false);
    });

    it('P3 succeeds with config.ts lump and --json', async () => {
        await fs.writeFile(
            path.join(localConfigFolderPath, 'lumps', 'my-lump', 'config.ts'),
            LUMP_PLAN_COMMAND_CONFIG_TS,
            'utf-8',
        );
        await fs.rm(path.join(localConfigFolderPath, 'lumps', 'my-lump', 'config.js'));

        const result = await makeHandler()({
            options: { json: true },
            arguments: { lumpName: 'my-lump' },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data?.valid).toBe(true);
    });

    it('does not call runProjectPreflight', async () => {
        const spy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');
        await makeHandler()({
            options: {},
            arguments: { lumpName: 'my-lump' },
        });
        expect(spy).not.toHaveBeenCalled();
    });

    it('fails allowlist validation for unlisted discoveryBranch (dedicated)', async () => {
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({
                mode: 'dedicated',
                discoveryBranch: 'main',
                discoveryBranches: ['main'],
            }),
            'utf-8',
        );
        await fs.writeFile(
            path.join(localConfigFolderPath, 'lumps', 'my-lump', 'config.js'),
            `export default {
  discoveryBranch: 'ver/0.0.9',
  getContextListFn: () => [{ name: 'alpha', variables: {} }],
  prompt: {
    promptFn: () => 'hello',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};`,
            'utf-8',
        );

        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'my-lump' },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/discoveryBranch|discoveryBranches|ver\/0\.0\.9/i);
    });

    it('succeeds in shared mode when discoveryBranch is unlisted (no allowlist)', async () => {
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({
                mode: 'shared',
                discoveryBranch: 'main',
                discoveryBranches: ['main'],
            }),
            'utf-8',
        );
        await fs.writeFile(
            path.join(localConfigFolderPath, 'lumps', 'my-lump', 'config.js'),
            `export default {
  discoveryBranch: 'ver/0.0.9',
  getContextListFn: () => [{ name: 'alpha', variables: {} }],
  prompt: {
    promptFn: () => 'hello',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};`,
            'utf-8',
        );

        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'my-lump' },
        });
        expect(result.success).toBe(true);
    });

    it('leaves checkout branch unchanged', async () => {
        const before = gitCurrentBranch(projectRoot);
        await makeHandler()({
            options: { contexts: true },
            arguments: { lumpName: 'my-lump' },
        });
        expect(gitCurrentBranch(projectRoot)).toBe(before);
    });
});
