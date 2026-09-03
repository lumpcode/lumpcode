import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDaemonCommandTestProject } from '../../testing';
import { removeTempTestDirs } from '../../utils';
import { command as superviseCommand } from './main';

describe('supervise command', () => {
    let projectRoot: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    const projectName = 'supervise-test-project';

    beforeEach(async () => {
        ({ projectRoot, globalConfigFolderPath, localConfigFolderPath } = await createDaemonCommandTestProject({ prefix: 'lump-supervise-', projectName, bindDaemonTestEnv: false }));
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, globalConfigFolderPath });
    });

    it('fails without --foreground', async () => {
        const handle = superviseCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
        const result = await handle({ options: {}, arguments: {} });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toMatch(/--foreground/);
    });

    it('runs one local pass then exits when waitForShutdownOverride resolves', async () => {
        const handle = superviseCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            waitForShutdownOverride: async () => {},
        });
        const result = await handle({ options: { foreground: true }, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data?.projectName).toBe(projectName);
    });
});
