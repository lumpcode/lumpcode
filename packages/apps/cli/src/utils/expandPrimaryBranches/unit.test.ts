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

/**
 * dynamic-discovery-branch X1–X6.
 * Skipped until expandPrimaryBranches is implemented.
 *
 * Expand order contract (document in impl): configured-entry order — exact
 * entries first-as-listed, then each glob's hits in ls-remote/dedupe order.
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

        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranches: ['main', 'feature/*'],
        };
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

        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranches: ['main', 'feature/*'],
        };
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

        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranches: ['main', 'feature/*'],
        };
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
            failure({ message: 'ls-remote timed out after 300000ms', reason: 'timeout' }),
        );

        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranches: ['main', 'feature/*'],
        };
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
            failure({ message: 'git failed', reason: 'exit' }),
        );
        const logger = createLogger();

        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranches: ['main', 'feature/*'],
        };
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

        const localConfig: LocalConfig = {
            mode: 'dedicated',
            primaryBranches: ['main', 'feature/*'],
        };
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

        const localConfig: LocalConfig = {
            mode: 'shared',
            primaryBranches: ['main', 'feature/*'],
        };
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
