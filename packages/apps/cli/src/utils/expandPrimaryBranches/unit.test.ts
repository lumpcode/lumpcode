import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { Logger } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';
import * as listRemoteHeadBranchesModule from '../listRemoteHeadBranches';
import { expandPrimaryBranches } from './main';

function createLogger(): Logger {
    return {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        verbose: vi.fn(),
        child: () => createLogger(),
    };
}

function expandTestLocalConfig(
    config: Pick<LocalConfig, 'mode' | 'primaryBranches'>,
): LocalConfig {
    return {
        workspaceStrategy: 'checkout',
        ...config,
    };
}

/**
 * dynamic-discovery-branch X1–X6.
 * Skipped until expandPrimaryBranches is implemented.
 *
 * Expand order contract (document in impl): configured-entry expand, then
 * resolved primary (first exact) moved to index 0.
 * Fixture default branch is `main` (matches initBareRemoteAndCheckout).
 */
describe('expandPrimaryBranches (dynamic-discovery-branch X*)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('X1: exact + glob union yields concrete scan set in stable order', async () => {
        const listSpy = vi
            .spyOn(listRemoteHeadBranchesModule, 'listRemoteHeadBranches')
            .mockResolvedValue(success(['feature/a', 'feature/b']));

        const localConfig = expandTestLocalConfig({
            mode: 'dedicated',
            primaryBranches: ['main', 'feature/*'],
        });
        const result = await expandPrimaryBranches({
            localConfig,
            cwd: '/tmp/repo',
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual(['main', 'feature/a', 'feature/b']);
        expect(listSpy).toHaveBeenCalledWith(
            expect.objectContaining({ cwd: '/tmp/repo', branchGlob: 'feature/*', timeoutMillis: 300_000 }),
        );
    });

    it('X2: exact entry kept even when missing on remote', async () => {
        vi.spyOn(listRemoteHeadBranchesModule, 'listRemoteHeadBranches').mockResolvedValue(
            success([]),
        );

        const localConfig = expandTestLocalConfig({
            mode: 'dedicated',
            primaryBranches: ['main', 'feature/*'],
        });
        const result = await expandPrimaryBranches({
            localConfig,
            cwd: '/tmp/repo',
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toContain('main');
    });

    it('X3: empty glob logs and contributes nothing; other entries kept', async () => {
        vi.spyOn(listRemoteHeadBranchesModule, 'listRemoteHeadBranches').mockResolvedValue(
            success([]),
        );
        const logger = createLogger();

        const localConfig = expandTestLocalConfig({
            mode: 'dedicated',
            primaryBranches: ['main', 'feature/*'],
        });
        const result = await expandPrimaryBranches({
            localConfig,
            cwd: '/tmp/repo',
            logger,
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual(['main']);
        expect(
            (logger.info as ReturnType<typeof vi.fn>).mock.calls.length +
                (logger.warn as ReturnType<typeof vi.fn>).mock.calls.length,
        ).toBeGreaterThan(0);
    });

    it('X4: ls-remote timeout returns Failure', async () => {
        vi.spyOn(listRemoteHeadBranchesModule, 'listRemoteHeadBranches').mockResolvedValue(
            failure({ message: 'ls-remote timed out after 300000ms', reason: 'timeout' as const }),
        );

        const localConfig = expandTestLocalConfig({
            mode: 'dedicated',
            primaryBranches: ['main', 'feature/*'],
        });
        const result = await expandPrimaryBranches({
            localConfig,
            cwd: '/tmp/repo',
            logger: createLogger(),
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/expand|ls-remote|feature\/\*|remote/i);
    });

    it('X4b: non-timeout ls-remote failure skips the glob like an empty match', async () => {
        vi.spyOn(listRemoteHeadBranchesModule, 'listRemoteHeadBranches').mockResolvedValue(
            failure({ message: 'git failed', reason: 'exit' as const }),
        );
        const logger = createLogger();

        const localConfig = expandTestLocalConfig({
            mode: 'dedicated',
            primaryBranches: ['main', 'feature/*'],
        });
        const result = await expandPrimaryBranches({
            localConfig,
            cwd: '/tmp/repo',
            logger,
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual(['main']);
        expect(
            (logger.info as ReturnType<typeof vi.fn>).mock.calls.length +
                (logger.warn as ReturnType<typeof vi.fn>).mock.calls.length,
        ).toBeGreaterThan(0);
    });

    it('X5: dedupes when glob also returns an exact entry', async () => {
        vi.spyOn(listRemoteHeadBranchesModule, 'listRemoteHeadBranches').mockResolvedValue(
            success(['main', 'feature/a']),
        );

        const localConfig = expandTestLocalConfig({
            mode: 'dedicated',
            primaryBranches: ['main', 'feature/*'],
        });
        const result = await expandPrimaryBranches({
            localConfig,
            cwd: '/tmp/repo',
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.filter((b) => b === 'main')).toHaveLength(1);
        expect(result.data).toEqual(['main', 'feature/a']);
    });

    it('X6: shared mode does not expand globs for scan fan-out', async () => {
        const listSpy = vi
            .spyOn(listRemoteHeadBranchesModule, 'listRemoteHeadBranches')
            .mockResolvedValue(success(['feature/a']));

        const localConfig = expandTestLocalConfig({
            mode: 'shared',
            primaryBranches: ['main', 'feature/*'],
        });
        const result = await expandPrimaryBranches({
            localConfig,
            cwd: '/tmp/repo',
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        // Exact primary only — no feature/* fan-out
        expect(result.data).toEqual(['main']);
        expect(listSpy).not.toHaveBeenCalled();
    });
});

/**
 * daemon-primary-branch-refresh-command X7–X8.
 * Skipped until expandPrimaryBranches pulls the resolved primary to index 0.
 */
describe('expandPrimaryBranches primary-first order (daemon-primary-branch-refresh-command X*)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('X7: glob before exact primary is reordered so primary is first', async () => {
        vi.spyOn(listRemoteHeadBranchesModule, 'listRemoteHeadBranches').mockResolvedValue(
            success(['feature/a', 'feature/b']),
        );

        const localConfig = expandTestLocalConfig({
            mode: 'dedicated',
            primaryBranches: ['feature/*', 'main'],
        });
        const result = await expandPrimaryBranches({
            localConfig,
            cwd: '/tmp/repo',
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual(['main', 'feature/a', 'feature/b']);
    });

    it('X8: only the first exact moves to front; other exacts keep expand order', async () => {
        vi.spyOn(listRemoteHeadBranchesModule, 'listRemoteHeadBranches').mockResolvedValue(
            success(['feature/a']),
        );

        const localConfig = expandTestLocalConfig({
            mode: 'dedicated',
            primaryBranches: ['feature/*', 'hotfix', 'dev'],
        });
        const result = await expandPrimaryBranches({
            localConfig,
            cwd: '/tmp/repo',
            logger: createLogger(),
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual(['hotfix', 'feature/a', 'dev']);
    });
});
