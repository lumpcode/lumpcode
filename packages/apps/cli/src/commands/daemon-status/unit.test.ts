import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
    aliveDaemonSpawnFn,
    setDaemonTestGlobalConfigFolder,
    waitForDaemonPidFile,
} from '../../testing';
import { command as startCommand } from '../start/main';
import { command as stopCommand } from '../stop/main';
import { command as daemonStatusCommand } from './main';

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

const minimalLumpConfigJson = `{
  "baseBranch": "main",
  "contextListJson": {
    "FILE": "src/{NAME}.ts"
  },
  "prompt": {
    "promptTemplate": "Improve the code at @{FILE}.",
    "command": "claude"
  }
}
`;

describe('daemon-status command', () => {
    let projectRoot: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    const projectName = 'status-test-project';

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-global-'));
        setDaemonTestGlobalConfigFolder(globalConfigFolderPath);
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        git('init -b main', projectRoot);
        git('config user.email "test@test.com"', projectRoot);
        git('config user.name "Test"', projectRoot);
        git('commit --allow-empty -m "init"', projectRoot);
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'alpha'), { recursive: true });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName }),
            'utf-8',
        );
        await fs.writeFile(
            path.join(localConfigFolderPath, 'lumps', 'alpha', 'config.json'),
            minimalLumpConfigJson,
            'utf-8',
        );
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'dedicated', primaryBranch: 'main' }),
            'utf-8',
        );
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    function makeDaemonStatusHandler() {
        return daemonStatusCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
    }

    it('fails when not a Lumpcode project root', async () => {
        const badRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-bad-'));
        const badGlobal = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-bad-global-'));
        try {
            await fs.mkdir(path.join(badRoot, '.lumpcode'), { recursive: true });
            const handle = daemonStatusCommand.handlerMaker({
                projectRoot: badRoot,
                localConfigFolderPath: path.join(badRoot, '.lumpcode'),
                globalConfigFolderPath: badGlobal,
            });
            const result = await handle({ options: {}, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain('Not a Lumpcode project root');
        } finally {
            await fs.rm(badRoot, { recursive: true, force: true });
            await fs.rm(badGlobal, { recursive: true, force: true });
        }
    });

    it('reports not running when there is no PID file', async () => {
        const result = await makeDaemonStatusHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data!.running).toBe(false);
        expect(result.data.messages[0]).toContain('not running');
    });

    it('reports stale PID when the PID file references a dead process', async () => {
        const daemonsDir = path.join(globalConfigFolderPath, 'daemons');
        await fs.mkdir(daemonsDir, { recursive: true });
        const pidPath = path.join(daemonsDir, `${projectName}.daemon.pid`);
        const metaPath = path.join(daemonsDir, `${projectName}.daemon.meta.json`);
        await fs.writeFile(pidPath, '999999999\n', 'utf8');
        await fs.writeFile(metaPath, `${JSON.stringify({ cronSetup: '0 * * * *' })}\n`, 'utf8');

        const result = await makeDaemonStatusHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data!.running).toBe(false);
        expect(result.data.data!.stalePidFile).toBe(true);
        expect(result.data.data!.cronSetup).toBe('0 * * * *');
        expect(result.data.messages.join('\n')).toMatch(/stale|not running/i);
    });

    it('reports running with schedule after a detached start', async () => {
        const startHandle = startCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            spawnFn: aliveDaemonSpawnFn,
        });
        const startResult = await startHandle({
            options: { cronSetup: '15 * * * *' },
            arguments: {},
        });
        expect(startResult.success).toBe(true);
        await waitForDaemonPidFile(
            path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.pid`),
        );

        try {
            const statusResult = await makeDaemonStatusHandler()({ options: { json: true }, arguments: {} });
            expect(statusResult.success).toBe(true);
            if (!statusResult.success) throw new Error('unreachable');
            expect(statusResult.data.data!.running).toBe(true);
            expect(statusResult.data.data!.cronSetup).toBe('15 * * * *');
            expect(typeof statusResult.data.data!.pid).toBe('number');
        } finally {
            const stopHandle = stopCommand.handlerMaker({
                projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
            });
            await stopHandle({ options: {}, arguments: {} });
        }
    });
});
