import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
    acquireExecutionWorkspaceLock,
    executionWorkspaceLockFilePath,
    executionWorkspaceLocksDirPath,
    isExecutionWorkspaceBusyError,
} from './main';

describe('executionWorkspaceLock', () => {
    let globalConfigFolderPath: string;
    const executionWorkspacePath = path.join(os.tmpdir(), 'lump-exec-lock-spec-test');

    beforeEach(async () => {
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-exec-lock-global-'));
    });

    afterEach(async () => {
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    it('uses execution-workspace-locks subdir and executionWorkspaceBusy code', async () => {
        expect(executionWorkspaceLocksDirPath({ globalConfigFolderPath })).toBe(
            path.join(globalConfigFolderPath, 'execution-workspace-locks'),
        );

        const acquired = await acquireExecutionWorkspaceLock({
            globalConfigFolderPath,
            executionWorkspacePath,
            lumpName: 'lump-a',
            mode: 'fail',
        });
        expect(acquired.success).toBe(true);
        if (!acquired.success) throw new Error('unreachable');

        const lockFilePath = executionWorkspaceLockFilePath({
            globalConfigFolderPath,
            executionWorkspacePath,
        });
        expect(lockFilePath).toContain('execution-workspace-locks');
        expect(lockFilePath.endsWith('.lock.json')).toBe(true);
        expect(lockFilePath).toBe(
            executionWorkspaceLockFilePath({
                globalConfigFolderPath,
                executionWorkspacePath: path.resolve(executionWorkspacePath),
            }),
        );

        const second = await acquireExecutionWorkspaceLock({
            globalConfigFolderPath,
            executionWorkspacePath,
            lumpName: 'lump-b',
            mode: 'fail',
        });
        expect(second.success).toBe(false);
        if (second.success) throw new Error('unreachable');
        expect(isExecutionWorkspaceBusyError(second.data)).toBe(true);
        if (!isExecutionWorkspaceBusyError(second.data)) throw new Error('unreachable');
        expect(second.data.code).toBe('executionWorkspaceBusy');
        expect(second.data.executionWorkspacePath).toBe(path.resolve(executionWorkspacePath));

        await acquired.data();
    });
});
