import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import type { Logger } from '@lumpcode/core';

import {
    createIntegrationBranch,
    initBareRemoteAndCheckout,
    writeLocalJson,
    writeMinimalLump,
} from '../../testing';
import { validateDaemonLaunch } from './main';

const minimalLumpConfigJson = `{
  "contextListJson": {
    "FILE": "src/{NAME}.ts"
  },
  "prompt": {
    "promptTemplate": "Improve the code at @{FILE}.",
    "command": "claude"
  }
}`;

function createLogger(): Logger & { warnings: string[] } {
    const warnings: string[] = [];
    const logger: Logger & { warnings: string[] } = {
        warnings,
        info: vi.fn(),
        warn: (message: string) => {
            warnings.push(message);
        },
        error: vi.fn(),
        verbose: vi.fn(),
        child: () => logger,
    };
    return logger;
}

function gitCommitAll(cwd: string, message: string): void {
    execSync('git add -A', { cwd, stdio: 'pipe' });
    try {
        execSync(`git commit -m ${JSON.stringify(message)}`, { cwd, stdio: 'pipe' });
    } catch {
        execSync(`git commit --allow-empty -m ${JSON.stringify(message)}`, { cwd, stdio: 'pipe' });
    }
    execSync('git push origin main', { cwd, stdio: 'pipe' });
}

describe('validateDaemonLaunch', () => {
    let localConfigFolderPath: string;
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-validate-daemon-launch-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-validate-daemon-launch-remote-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-validate-daemon-launch-global-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
        });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'validate-daemon-launch-test' }),
            'utf-8',
        );
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    it('warns and succeeds when a lump directory has no loadable config (dedicated)', async () => {
        const validDir = path.join(localConfigFolderPath, 'lumps', 'alpha');
        await fs.mkdir(validDir, { recursive: true });
        await fs.writeFile(path.join(validDir, 'config.json'), minimalLumpConfigJson, 'utf-8');
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'v0.0.9'), { recursive: true });
        gitCommitAll(projectRoot, 'alpha and empty v0.0.9 dir');

        const logger = createLogger();
        const result = await validateDaemonLaunch({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: { mode: 'dedicated', primaryBranch: 'main' },
            logger,
        });

        expect(result.success).toBe(true);
        expect(logger.warnings).toEqual([
            'lump "v0.0.9": Lump config not found for v0.0.9; skipping',
        ]);
    });

    it('succeeds when releaseLine exists only on ver/0.0.9', async () => {
        await writeMinimalLump(projectRoot, 'mainLine', { discoveryBranch: 'main' });
        gitCommitAll(projectRoot, 'mainLine on main');
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'ver/0.0.9',
            lumpSpecs: [
                {
                    name: 'releaseLine',
                    configOverrides: { discoveryBranch: 'ver/0.0.9', baseBranch: 'ver/0.0.9' },
                },
            ],
        });

        const logger = createLogger();
        const result = await validateDaemonLaunch({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'ver/0.0.9'],
            },
            logger,
        });

        expect(result.success).toBe(true);
    });

    it('returns failure when an explicit lumpName has no loadable config', async () => {
        const logger = createLogger();
        const result = await validateDaemonLaunch({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: { mode: 'dedicated', primaryBranch: 'main' },
            lumpNameOpt: 'missing',
            logger,
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('Lump config not found for missing');
        expect(logger.warnings).toEqual([]);
    });
});
