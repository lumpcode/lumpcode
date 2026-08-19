import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { noopLogger } from '../noopLogger';
import { writeJsonFile } from '../writeJsonFile';
import { writeStartDaemonDesired } from '../startDaemonDesired';
import { runSuperviseLocalPass } from './main';

describe('runSuperviseLocalPass', () => {
    let tmp: string;
    let projectRoot: string;
    let daemonsDir: string;
    const projectName = 'demo_proj';

    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-local-pass-'));
        projectRoot = path.join(tmp, 'proj');
        daemonsDir = path.join(tmp, 'daemons');
        await fs.mkdir(path.join(projectRoot, '.lumpcode'), { recursive: true });
        await fs.mkdir(daemonsDir, { recursive: true });
        await writeJsonFile({
            filePath: path.join(projectRoot, '.lumpcode', 'project.json'),
            data: { projectName },
        });
        await writeJsonFile({
            filePath: path.join(projectRoot, '.lumpcode', 'local.json'),
            data: { mode: 'dedicated', primaryBranch: 'main', workspaceStrategy: 'worktree' },
        });
    });

    afterEach(async () => {
        await fs.rm(tmp, { recursive: true, force: true });
    });

    it('spawns start --foreground when desired is present and no live pid', async () => {
        await writeStartDaemonDesired({
            desiredFilePath: path.join(daemonsDir, `${projectName}.global.daemon.desired.json`),
            desired: {
                projectRoot,
                daemonId: 'global',
                cronSetup: '*/7 * * * *',
                include: ['backlog'],
            },
        });
        const spawnFn = vi.fn(() => ({ pid: 4242, unref: vi.fn() })) as unknown as typeof nodeSpawn;
        const result = await runSuperviseLocalPass({
            projectName,
            projectRoot,
            daemonsDir,
            logger: noopLogger,
            spawnFn,
        });
        expect(result.success).toBe(true);
        expect(spawnFn).toHaveBeenCalledOnce();
        const args = spawnFn.mock.calls[0]![1] as string[];
        expect(args).toContain('start');
        expect(args).toContain('--foreground');
        expect(args).toContain('*/7 * * * *');
        expect((await fs.readFile(path.join(daemonsDir, `${projectName}.global.daemon.pid`), 'utf8')).trim()).toBe(
            '4242',
        );
    });

    it('deletes leftover desired when stopping and the pid is gone', async () => {
        const desiredFilePath = path.join(daemonsDir, `${projectName}.agents.daemon.desired.json`);
        await writeStartDaemonDesired({
            desiredFilePath,
            desired: {
                projectRoot,
                daemonId: 'agents',
                cronSetup: '*/5 * * * *',
                stopping: true,
            },
        });
        const result = await runSuperviseLocalPass({
            projectName,
            projectRoot,
            daemonsDir,
            logger: noopLogger,
        });
        expect(result.success).toBe(true);
        await expect(fs.access(desiredFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('adopts a live unstamped daemon into desired.json', async () => {
        const pidFilePath = path.join(daemonsDir, `${projectName}.global.daemon.pid`);
        const metaFilePath = path.join(daemonsDir, `${projectName}.global.daemon.meta.json`);
        await fs.writeFile(pidFilePath, String(process.pid), 'utf8');
        await writeJsonFile({
            filePath: metaFilePath,
            data: {
                daemonId: 'global',
                cronSetup: '*/9 * * * *',
                workspaceStrategy: 'checkout',
            },
            trailingNewline: true,
        });
        const spawnFn = vi.fn() as unknown as typeof nodeSpawn;
        const result = await runSuperviseLocalPass({
            projectName,
            projectRoot,
            daemonsDir,
            logger: noopLogger,
            spawnFn,
        });
        expect(result.success).toBe(true);
        expect(spawnFn).not.toHaveBeenCalled();
        const desired = JSON.parse(
            await fs.readFile(path.join(daemonsDir, `${projectName}.global.daemon.desired.json`), 'utf8'),
        ) as { daemonId: string; cronSetup: string };
        expect(desired.daemonId).toBe('global');
        expect(desired.cronSetup).toBe('*/9 * * * *');
        const meta = JSON.parse(await fs.readFile(metaFilePath, 'utf8')) as { cronSetup: string };
        expect(meta.cronSetup).toBe('*/9 * * * *');
    });
});
