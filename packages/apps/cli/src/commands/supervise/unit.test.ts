import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initLocalGitRepo, writeJsonFile, writeLumpConfigJson } from '../../utils';
import { command as superviseCommand } from './main';

describe('supervise command', () => {
    let projectRoot: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    const projectName = 'supervise-test-project';

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-supervise-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-supervise-global-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        initLocalGitRepo({ cwd: projectRoot });
        await writeLumpConfigJson({ localConfigFolderPath, lumpName: 'alpha' });
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'project.json'),
            data: { projectName },
        });
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'local.json'),
            data: { mode: 'dedicated', primaryBranch: 'main' },
        });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
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
