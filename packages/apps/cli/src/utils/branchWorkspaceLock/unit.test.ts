import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
    acquireBranchWorkspaceLock,
    branchWorkspaceLockFilePath,
    branchWorkspaceLocksDirPath,
    isBranchWorkspaceBusyError,
} from './main';

describe('branchWorkspaceLock', () => {
    let globalConfigFolderPath: string;
    const branchWorkspacePath = path.join(os.tmpdir(), 'lump-branch-lock-spec-test');

    beforeEach(async () => {
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-branch-lock-global-'));
    });

    afterEach(async () => {
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    it('uses branch-workspace-locks subdir and branchWorkspaceBusy code', async () => {
        expect(branchWorkspaceLocksDirPath({ globalConfigFolderPath })).toBe(
            path.join(globalConfigFolderPath, 'branch-workspace-locks'),
        );

        const acquired = await acquireBranchWorkspaceLock({
            globalConfigFolderPath,
            branchWorkspacePath,
            lumpName: 'lump-a',
            mode: 'fail',
        });
        expect(acquired.success).toBe(true);
        if (!acquired.success) throw new Error('unreachable');

        const lockFilePath = branchWorkspaceLockFilePath({
            globalConfigFolderPath,
            branchWorkspacePath,
        });
        expect(lockFilePath).toContain('branch-workspace-locks');
        expect(lockFilePath.endsWith('.lock.json')).toBe(true);

        const second = await acquireBranchWorkspaceLock({
            globalConfigFolderPath,
            branchWorkspacePath,
            lumpName: 'lump-b',
            mode: 'fail',
        });
        expect(second.success).toBe(false);
        if (second.success) throw new Error('unreachable');
        expect(isBranchWorkspaceBusyError(second.data)).toBe(true);
        if (!isBranchWorkspaceBusyError(second.data)) throw new Error('unreachable');
        expect(second.data.code).toBe('branchWorkspaceBusy');
        expect(second.data.branchWorkspacePath).toBe(path.resolve(branchWorkspacePath));

        await acquired.data();
    });
});
