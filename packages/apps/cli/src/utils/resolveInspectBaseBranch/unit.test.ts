import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LocalConfig } from '../../types/LocalConfig';
import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { writeLumpConfigJson } from '../writeLumpConfigJson';
import { resolveInspectBaseBranch } from './main';

function dedicated(primaryBranches: string[]): LocalConfig {
    return {
        mode: 'dedicated',
        primaryBranch: 'main',
        primaryBranches,
        workspaceStrategy: 'checkout',
    };
}

const shared: LocalConfig = {
    mode: 'shared',
    primaryBranch: 'main',
    workspaceStrategy: 'checkout',
};

describe('resolveInspectBaseBranch', () => {
    let projectRoot: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        ({ projectRoot, localConfigFolderPath } = await createTempTestDirs({
            prefix: 'lump-inspect-base-',
            remote: false,
            global: false,
        }));
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot });
    });

    async function writeLump(lumpName: string, lumpConfig: Record<string, unknown>) {
        await writeLumpConfigJson({
            localConfigFolderPath,
            lumpName,
            configOverrides: lumpConfig,
        });
        return lumpConfig;
    }

    it('returns an explicit baseBranch', async () => {
        const lumpConfig = { baseBranch: 'release', discoveryBranch: 'main' };
        await writeLump('explicit', lumpConfig);

        const result = await resolveInspectBaseBranch({
            lumpName: 'explicit',
            lumpConfig,
            localConfig: dedicated(['main']),
            localConfigFolderPath,
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toBe('release');
    });

    it('returns an exact discoveryBranch when baseBranch is omitted', async () => {
        const lumpConfig = { discoveryBranch: 'dev' };
        await writeLump('exact', lumpConfig);

        const result = await resolveInspectBaseBranch({
            lumpName: 'exact',
            lumpConfig,
            localConfig: dedicated(['main', 'dev']),
            localConfigFolderPath,
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toBe('dev');
    });

    it('returns primaryBranch when baseBranch and discovery are omitted', async () => {
        const lumpConfig = {};
        await writeLump('plain', lumpConfig);

        const result = await resolveInspectBaseBranch({
            lumpName: 'plain',
            lumpConfig,
            localConfig: dedicated(['main']),
            localConfigFolderPath,
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toBe('main');
    });

    it('returns primaryBranch in shared mode when the flag is omitted', async () => {
        const lumpConfig = { discoveryBranch: 'dev' };
        await writeLump('sharedLump', lumpConfig);

        const result = await resolveInspectBaseBranch({
            lumpName: 'sharedLump',
            lumpConfig,
            localConfig: shared,
            localConfigFolderPath,
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toBe('main');
    });

    it('fails pattern-only discovery without --discoveryBranch', async () => {
        const lumpConfig = { discoveryBranch: 'feature/*' };
        await writeLump('patternOnly', lumpConfig);

        const result = await resolveInspectBaseBranch({
            lumpName: 'patternOnly',
            lumpConfig,
            localConfig: dedicated(['main', 'feature/*']),
            localConfigFolderPath,
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/--discoveryBranch/);
    });

    it('returns a concrete --discoveryBranch that matches a pattern rule', async () => {
        const lumpConfig = { discoveryBranch: 'feature/*' };
        await writeLump('patternOnly', lumpConfig);

        const result = await resolveInspectBaseBranch({
            lumpName: 'patternOnly',
            lumpConfig,
            localConfig: dedicated(['main', 'feature/*']),
            localConfigFolderPath,
            discoveryBranchOpt: 'feature/a',
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toBe('feature/a');
    });
});
