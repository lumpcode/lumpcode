import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
    acquireWorkspacePathLock,
    isWorkspacePathBusyError,
    workspacePathLockFilePath,
    workspacePathLocksDirPath,
} from './main';

describe('workspacePathLock', () => {
    let globalConfigFolderPath: string;
    const workspacePath = path.join(os.tmpdir(), 'lump-path-lock-spec-test');

    beforeEach(async () => {
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-path-lock-global-'));
    });

    afterEach(async () => {
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    it('uses workspace-path-locks subdir and workspacePathBusy code', async () => {
        expect(workspacePathLocksDirPath({ globalConfigFolderPath })).toBe(
            path.join(globalConfigFolderPath, 'workspace-path-locks'),
        );

        const acquired = await acquireWorkspacePathLock({
            globalConfigFolderPath,
            workspacePath,
            lumpName: 'lump-a',
            mode: 'fail',
        });
        expect(acquired.success).toBe(true);
        if (!acquired.success) throw new Error('unreachable');

        const lockFilePath = workspacePathLockFilePath({
            globalConfigFolderPath,
            workspacePath,
        });
        expect(lockFilePath).toContain('workspace-path-locks');
        expect(lockFilePath.endsWith('.lock.json')).toBe(true);
        expect(lockFilePath).toBe(
            workspacePathLockFilePath({
                globalConfigFolderPath,
                workspacePath: path.resolve(workspacePath),
            }),
        );

        const second = await acquireWorkspacePathLock({
            globalConfigFolderPath,
            workspacePath,
            lumpName: 'lump-b',
            mode: 'fail',
        });
        expect(second.success).toBe(false);
        if (second.success) throw new Error('unreachable');
        expect(isWorkspacePathBusyError(second.data)).toBe(true);
        if (!isWorkspacePathBusyError(second.data)) throw new Error('unreachable');
        expect(second.data.code).toBe('workspacePathBusy');
        expect(second.data.workspacePath).toBe(path.resolve(workspacePath));

        await acquired.data();
    });
});
