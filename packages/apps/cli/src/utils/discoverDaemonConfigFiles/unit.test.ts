import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { Logger } from '@lumpcode/core';

import { createIntegrationBranch, daemonConfigFileJson, initBareRemoteAndCheckout } from '../../testing';
import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { execGit } from '../execGit';
import { DaemonConfigFile, hashDaemonConfigFile } from '../daemonConfigFile';
import { discoverDaemonConfigFiles } from './main';

function createLogger(): Logger {
    return {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        verbose: vi.fn(),
        child: () => createLogger(),
    };
}

describe('discoverDaemonConfigFiles', () => {
    let projectRoot: string;
    let remoteDir: string;
    let logger: Logger;

    beforeEach(async () => {
        ({ projectRoot, remoteDir } = await createTempTestDirs({
            prefix: 'lump-discover-daemon-cfg-',
            global: false,
        }));
        initBareRemoteAndCheckout(projectRoot, remoteDir);
        logger = createLogger();
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, remoteDir });
    });

    it('considers a file only when discoveryBranch equals the origin ref branch', async () => {
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'feat/a',
            extraFiles: {
                '.lumpcode/daemons/agents.json': daemonConfigFileJson('feat/a', { include: ['agents'] }),
            },
        });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'feat/b',
            extraFiles: {
                '.lumpcode/daemons/agents.json': daemonConfigFileJson('dev', { include: ['agents'] }),
            },
        });
        execGit('fetch origin', projectRoot);

        const match = await discoverDaemonConfigFiles({
            cwd: projectRoot,
            effectiveDiscoveryBranches: ['feat/a'],
            logger,
        });
        expect(match.success).toBe(true);
        if (!match.success) throw new Error('unreachable');
        expect(match.data).toHaveLength(1);
        expect(match.data[0]).toMatchObject({
            daemonId: 'agents',
            effectiveDiscoveryBranch: 'feat/a',
            path: '.lumpcode/daemons/agents.json',
            parsed: { discoveryBranch: 'feat/a', include: ['agents'] },
        });
        expect(match.data[0]!.hash).toBe(
            hashDaemonConfigFile({ discoveryBranch: 'feat/a', include: ['agents'] }),
        );

        const mismatch = await discoverDaemonConfigFiles({
            cwd: projectRoot,
            effectiveDiscoveryBranches: ['feat/b'],
            logger,
        });
        expect(mismatch.success).toBe(true);
        if (!mismatch.success) throw new Error('unreachable');
        expect(mismatch.data).toEqual([]);
    });

    it('drops both files when the same stem has two extensions on one branch', async () => {
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'dev',
            extraFiles: {
                '.lumpcode/daemons/nightly.json': daemonConfigFileJson('dev'),
                '.lumpcode/daemons/nightly.yml': 'discoveryBranch: dev\n',
            },
        });
        execGit('fetch origin', projectRoot);

        const result = await discoverDaemonConfigFiles({
            cwd: projectRoot,
            effectiveDiscoveryBranches: ['dev'],
            logger,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual([]);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('nightly'),
        );
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('multiple extensions'),
        );
    });

    it('keeps the first expand-order winner when the same daemonId appears on two branches', async () => {
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'dev',
            extraFiles: {
                '.lumpcode/daemons/shared.json': daemonConfigFileJson('dev', { include: ['from-dev'] }),
            },
        });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'feat/a',
            extraFiles: {
                '.lumpcode/daemons/shared.json': daemonConfigFileJson('feat/a', { include: ['from-feat'] }),
            },
        });
        execGit('fetch origin', projectRoot);

        const result = await discoverDaemonConfigFiles({
            cwd: projectRoot,
            effectiveDiscoveryBranches: ['dev', 'feat/a'],
            logger,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toMatchObject({
            daemonId: 'shared',
            effectiveDiscoveryBranch: 'dev',
            parsed: { discoveryBranch: 'dev', include: ['from-dev'] },
        });
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringMatching(/already considered from "dev".*feat\/a/s),
        );
    });

    it('ignores README, nested paths, and invalid stems', async () => {
        const daemonsDir = path.join(projectRoot, '.lumpcode', 'daemons');
        await fs.mkdir(path.join(daemonsDir, 'nested'), { recursive: true });
        await fs.writeFile(path.join(daemonsDir, 'README.md'), '# ignore\n', 'utf-8');
        await fs.writeFile(path.join(daemonsDir, 'bad name.json'), daemonConfigFileJson('main'), 'utf-8');
        await fs.writeFile(path.join(daemonsDir, 'ok.bak'), daemonConfigFileJson('main'), 'utf-8');
        await fs.writeFile(path.join(daemonsDir, 'nested', 'deep.json'), daemonConfigFileJson('main'), 'utf-8');
        await fs.writeFile(path.join(daemonsDir, 'ok.json'), daemonConfigFileJson('main'), 'utf-8');
        execGit('add .lumpcode/daemons', projectRoot);
        execGit('commit -m "daemon files on main"', projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin', projectRoot);

        const result = await discoverDaemonConfigFiles({
            cwd: projectRoot,
            effectiveDiscoveryBranches: ['main'],
            logger,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.map((c) => c.daemonId)).toEqual(['ok']);
        expect(result.data[0]!.path).toBe('.lumpcode/daemons/ok.json');
    });

    it('skips a missing origin tracking ref without failing the snapshot', async () => {
        const result = await discoverDaemonConfigFiles({
            cwd: projectRoot,
            effectiveDiscoveryBranches: ['missing-branch', 'main'],
            logger,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual([]);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('refs/remotes/origin/missing-branch'),
        );
    });

    it('drops invalid parse or schema files and does not read cwd-only files', async () => {
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'dev',
            extraFiles: {
                '.lumpcode/daemons/broken.json': '{not-json',
                '.lumpcode/daemons/extra-key.json': daemonConfigFileJson('dev', { daemonId: 'nope' } as unknown as DaemonConfigFile),
                '.lumpcode/daemons/good.yml': 'discoveryBranch: dev\ncronSetup: "*/10 * * * *"\n',
            },
        });
        execGit('fetch origin', projectRoot);

        // Working-tree-only file must not be considered.
        const daemonsDir = path.join(projectRoot, '.lumpcode', 'daemons');
        await fs.mkdir(daemonsDir, { recursive: true });
        await fs.writeFile(path.join(daemonsDir, 'cwd-only.json'), daemonConfigFileJson('main'), 'utf-8');

        const result = await discoverDaemonConfigFiles({
            cwd: projectRoot,
            effectiveDiscoveryBranches: ['dev'],
            logger,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toMatchObject({
            daemonId: 'good',
            effectiveDiscoveryBranch: 'dev',
            path: '.lumpcode/daemons/good.yml',
            parsed: { discoveryBranch: 'dev', cronSetup: '*/10 * * * *' },
        });
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('broken.json'));
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('extra-key.json'));
    });
});
