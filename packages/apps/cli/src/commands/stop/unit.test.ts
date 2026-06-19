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
import { command as stopCommand } from './main';
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
describe('stop command', () => {
    let projectRoot: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    const projectName = 'stop-test-project';
    const pidPath = () =>
        path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.pid`);
    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-stop-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-stop-global-'));
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
            JSON.stringify({ mode: 'dedicated', projectBaseBranch: 'main' }),
            'utf-8',
        );
    });
    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });
    function makeStopHandler() {
        return stopCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
    }
    async function runStart(spawnFn: typeof aliveDaemonSpawnFn) {
        const handle = startCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            spawnFn,
        });
        const result = await handle({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
    }
    it('fails when there is no PID file', async () => {
        const result = await makeStopHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('No daemon PID file');
    });
    it('cleans up stale PID when the daemon process is gone', async () => {
        await fs.mkdir(path.dirname(pidPath()), { recursive: true });
        await fs.writeFile(pidPath(), '999999999\n', 'utf8');
        const result = await makeStopHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toMatch(/not running|removed stale/i);
        await expect(fs.access(pidPath())).rejects.toMatchObject({ code: 'ENOENT' });
    });
    it('stops the daemon started by the start command and removes the PID file', async () => {
        await runStart(aliveDaemonSpawnFn);
        await waitForDaemonPidFile(pidPath());
        const raw = await fs.readFile(pidPath(), 'utf8');
        const pid = Number.parseInt(raw.trim(), 10);
        expect(Number.isNaN(pid)).toBe(false);
        const result = await makeStopHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('Stopped Lumpcode daemon');
        await expect(fs.access(pidPath())).rejects.toMatchObject({ code: 'ENOENT' });
        try {
            process.kill(pid, 0);
            throw new Error('expected child to be dead');
        } catch (e) {
            expect(e).toMatchObject({ code: 'ESRCH' });
        }
    });
});