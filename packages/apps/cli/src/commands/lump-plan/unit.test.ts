import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { LUMP_PLAN_COMMAND_CONFIG_TS } from '../../testing/tsLumpFixtures';
import { command } from './main';
import * as runProjectPreflightModule from '../../utils/runProjectPreflight';
import {
    createIntegrationBranch,
    gitCurrentBranch,
    initBareRemoteAndCheckout,
    writeLocalJson,
    writeMinimalLump,
} from '../../testing';
import { execGit, initLocalGitRepo } from '../../utils';
import { writeJsonFile } from '../../utils/writeJsonFile';

const LUMP_CONFIG_JS = `export default {
  getContextListFn: () => [{ name: 'alpha', variables: {} }],
  prompt: {
    promptFn: () => 'hello',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};
`;

describe('lump-plan command', () => {
    let projectRoot: string;
    let localConfigFolderPath: string;
    const globalConfigFolderPath = path.join(os.homedir(), '.lumpcode-test-plan-global');

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-plan-cmd-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'my-lump'), { recursive: true });
        await fs.mkdir(globalConfigFolderPath, { recursive: true });
        await writeJsonFile({ filePath: path.join(localConfigFolderPath, 'local.json'), data: { mode: 'dedicated', primaryBranch: 'main' } });
        await writeJsonFile({ filePath: path.join(localConfigFolderPath, 'project.json'), data: { projectName: 'plan-cmd-test' } });

        initLocalGitRepo({ cwd: projectRoot });

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
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'local.json'),
            data: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main'],
            },
        });
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
        expect(result.data.messages.join(' ')).toMatch(/discoveryBranch|primaryBranches|ver\/0\.0\.9/i);
    });

    it('succeeds in shared mode when discoveryBranch is unlisted (no allowlist)', async () => {
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'local.json'),
            data: {
                mode: 'shared',
                primaryBranch: 'main',
                primaryBranches: ['main'],
            },
        });
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

/**
 * dynamic-discovery-branch F1–F4.
 * Skipped until lump-plan wires discoveryBranch resolution (mirrors run C1–C4).
 * Fixture default branch is `main`.
 */
describe('lump-plan command — dynamic-discovery-branch (F*)', () => {
    let projectRoot: string;
    let remoteDir: string;
    let localConfigFolderPath: string;
    const globalConfigFolderPath = path.join(os.homedir(), '.lumpcode-test-plan-ddb-global');

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-plan-ddb-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-plan-ddb-remote-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await fs.mkdir(globalConfigFolderPath, { recursive: true });
        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'project.json'),
            data: { projectName: 'plan-ddb-test' },
        });
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
    });

    function makeHandler() {
        return command.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
    }

    async function setupMultiRuleDedicated() {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'multi', {
            discoveryBranches: ['main', 'feature/*'],
        });
        execGit('add -A', projectRoot);
        execGit('commit -m "multi lump"', projectRoot);
        execGit('push origin main', projectRoot);
    }

    it('F1: flagless multi-rule lump succeeds with first exact discovery', async () => {
        await setupMultiRuleDedicated();
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');

        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'multi' },
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data?.valid).toBe(true);
        expect(preflightSpy).not.toHaveBeenCalled();
    });

    it('F2: pattern-only lump without flag fails with --discoveryBranch hint', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'feature/*'],
        });
        await writeMinimalLump(projectRoot, 'patternOnly', { discoveryBranch: 'feature/*' });
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');

        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'patternOnly' },
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/--discoveryBranch/);
        expect(preflightSpy).not.toHaveBeenCalled();
    });

    it('F3: discoveryBranch feature/a option succeeds for multi-rule lump', async () => {
        await setupMultiRuleDedicated();
        await createIntegrationBranch({ projectRoot, remoteDir, branchName: 'feature/a' });

        const result = await makeHandler()({
            options: { discoveryBranch: 'feature/a' } as Record<string, unknown>,
            arguments: { lumpName: 'multi' },
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data?.valid).toBe(true);
    });

    it('F4: discoveryBranch feature/* option fails (concrete-only)', async () => {
        await setupMultiRuleDedicated();

        const result = await makeHandler()({
            options: { discoveryBranch: 'feature/*' } as Record<string, unknown>,
            arguments: { lumpName: 'multi' },
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join(' ')).toMatch(/concrete|pattern|discoveryBranch/i);
    });
});
