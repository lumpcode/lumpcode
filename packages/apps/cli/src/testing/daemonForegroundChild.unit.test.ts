import { execFile, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import { aliveDaemonSpawnFn } from './aliveDaemonSpawn';
import { pollUntil } from '../utils/pollUntil';

const execFileAsync = promisify(execFile);
const childScript = fileURLToPath(new URL('./daemonForegroundChild.cjs', import.meta.url));

const PARENT_HARNESS = `
'use strict';
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const readyFile = process.env.READY_FILE;
const releaseFile = process.env.RELEASE_FILE;
const mode = process.env.MODE;
const childScript = process.env.CHILD_SCRIPT;
const stayOnly = process.env.STAY_ONLY === '1';
const pidFile = process.env.PID_FILE;

const child = spawn(process.execPath, [childScript], {
    detached: true,
    stdio: 'ignore',
    env: {
        ...process.env,
        LUMPCODE_DAEMON_PARENT_PID: String(process.pid),
        LUMPCODE_DAEMON_STAY_ALIVE_ONLY: stayOnly ? '1' : '',
        LUMPCODE_DAEMON_PROJECT_ROOT: process.env.PROJECT_ROOT || '',
        LUMPCODE_DAEMON_GLOBAL_CONFIG: process.env.GLOBAL_CONFIG || '',
    },
});
child.unref();
const deadline = Date.now() + 5000;
function finish(childPid) {
    fs.writeFileSync(readyFile, JSON.stringify({ childPid, parentPid: process.pid }));
    if (mode === 'sigkill') {
        process.kill(process.pid, 'SIGKILL');
        return;
    }
    if (mode === 'exit') {
        process.exit(0);
        return;
    }
    const hold = () => {
        if (fs.existsSync(releaseFile)) process.exit(0);
        else setTimeout(hold, 20);
    };
    hold();
}
function wait() {
    let childPid = child.pid;
    if (!stayOnly && pidFile && fs.existsSync(pidFile)) {
        const written = Number(fs.readFileSync(pidFile, 'utf8'));
        if (Number.isInteger(written) && written > 0) childPid = written;
    }
    let alive = false;
    try { process.kill(childPid, 0); alive = true; } catch { /* not yet */ }
    if (!alive || (!stayOnly && !(pidFile && fs.existsSync(pidFile)))) {
        if (Date.now() > deadline) {
            fs.writeFileSync(readyFile, JSON.stringify({ error: 'child did not stay up', childPid }));
            process.exit(1);
        }
        setTimeout(wait, 20);
        return;
    }
    setTimeout(() => {
        try {
            process.kill(childPid, 0);
        } catch {
            fs.writeFileSync(readyFile, JSON.stringify({ error: 'child exited while parent lived', childPid }));
            process.exit(1);
            return;
        }
        finish(childPid);
    }, 150);
}
wait();
`;

function probeAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

describe('daemonForegroundChild', () => {
    const dirs: string[] = [];
    const pids: number[] = [];

    afterEach(async () => {
        for (const pid of pids) {
            try {
                process.kill(pid, 'SIGKILL');
            } catch {
                // already gone
            }
        }
        pids.length = 0;
        await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    });

    async function makeFixture(): Promise<{ dir: string; projectRoot: string; globalConfig: string; pidFile: string }> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-dfc-'));
        dirs.push(dir);
        const projectRoot = path.join(dir, 'project');
        const globalConfig = path.join(dir, 'global');
        await fs.mkdir(path.join(projectRoot, '.lumpcode'), { recursive: true });
        await fs.writeFile(
            path.join(projectRoot, '.lumpcode', 'project.json'),
            `${JSON.stringify({ projectName: 'fg-child' })}\n`,
        );
        const pidFile = path.join(globalConfig, 'daemons', 'fg-child.global.daemon.pid');
        return { dir, projectRoot, globalConfig, pidFile };
    }

    async function spawnWatchedChild(input: {
        mode: 'exit' | 'sigkill' | 'stay';
        stayOnly?: boolean;
    }): Promise<{ childPid: number; parentPid: number; releaseFile: string }> {
        const { dir, projectRoot, globalConfig, pidFile } = await makeFixture();
        const harnessPath = path.join(dir, 'parent.cjs');
        const readyFile = path.join(dir, 'ready.json');
        const releaseFile = path.join(dir, 'release');
        await fs.writeFile(harnessPath, PARENT_HARNESS);
        const parent = spawn(process.execPath, [harnessPath], {
            stdio: ['ignore', 'ignore', 'pipe'],
            env: {
                ...process.env,
                READY_FILE: readyFile,
                RELEASE_FILE: releaseFile,
                MODE: input.mode,
                CHILD_SCRIPT: childScript,
                STAY_ONLY: input.stayOnly ? '1' : '',
                PID_FILE: pidFile,
                PROJECT_ROOT: projectRoot,
                GLOBAL_CONFIG: globalConfig,
            },
        });
        if (parent.pid !== undefined) pids.push(parent.pid);
        let parentErr = '';
        parent.stderr?.on('data', (chunk: Buffer) => {
            parentErr += String(chunk);
        });
        const ready = await pollUntil({
            timeoutMs: 5000,
            intervalMs: 20,
            timeoutError: () => new Error(`parent harness did not become ready: ${parentErr}`),
            poll: async () => {
                try {
                    return JSON.parse(await fs.readFile(readyFile, 'utf8')) as {
                        childPid?: number;
                        parentPid?: number;
                        error?: string;
                    };
                } catch {
                    return undefined;
                }
            },
        });
        if (!ready || ready.error || ready.childPid === undefined || ready.parentPid === undefined) {
            throw new Error(`parent harness failed: ${JSON.stringify(ready)} ${parentErr}`);
        }
        pids.push(ready.childPid, ready.parentPid);
        return { childPid: ready.childPid, parentPid: ready.parentPid, releaseFile };
    }

    async function waitUntilGone(pid: number): Promise<void> {
        await pollUntil({
            timeoutMs: 5000,
            intervalMs: 20,
            timeoutError: `pid ${pid} was still alive`,
            poll: () => (probeAlive(pid) ? undefined : true),
        });
    }

    it('stays up while the spawning process lives, then exits with it', async () => {
        const { childPid, parentPid, releaseFile } = await spawnWatchedChild({ mode: 'stay' });
        expect(probeAlive(childPid)).toBe(true);
        expect(probeAlive(parentPid)).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 1200));
        expect(probeAlive(childPid)).toBe(true);

        await fs.writeFile(releaseFile, 'go\n');
        await waitUntilGone(parentPid);
        await waitUntilGone(childPid);
        expect(probeAlive(childPid)).toBe(false);
    });

    it.each(['exit', 'sigkill'] as const)(
        'does not live on as an orphan when the parent %s',
        async (mode) => {
            const { childPid, parentPid } = await spawnWatchedChild({ mode });
            await waitUntilGone(parentPid);
            await waitUntilGone(childPid);
            expect(probeAlive(childPid)).toBe(false);
        },
    );

    it('supervise stand-in exits when its parent dies', async () => {
        const { childPid, parentPid } = await spawnWatchedChild({ mode: 'sigkill', stayOnly: true });
        await waitUntilGone(parentPid);
        await waitUntilGone(childPid);
    });

    it('exits immediately when the recorded parent is already gone', async () => {
        const { projectRoot, globalConfig, pidFile } = await makeFixture();
        const dead = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
        await new Promise<void>((resolve, reject) => {
            dead.on('exit', () => resolve());
            dead.on('error', reject);
        });
        const child = spawn(process.execPath, [childScript], {
            stdio: 'ignore',
            env: {
                ...process.env,
                LUMPCODE_DAEMON_PROJECT_ROOT: projectRoot,
                LUMPCODE_DAEMON_GLOBAL_CONFIG: globalConfig,
                LUMPCODE_DAEMON_PARENT_PID: String(dead.pid),
                LUMPCODE_DAEMON_STAY_ALIVE_ONLY: '',
            },
        });
        if (child.pid !== undefined) pids.push(child.pid);
        const code = await exitCode(child, 2000);
        expect(code).toBe(0);
        await expect(fs.access(pidFile)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('still fails closed when daemon env is missing', async () => {
        const child = spawn(process.execPath, [childScript], {
            stdio: ['ignore', 'ignore', 'pipe'],
            env: {
                ...process.env,
                LUMPCODE_DAEMON_PROJECT_ROOT: '',
                LUMPCODE_DAEMON_GLOBAL_CONFIG: '',
                LUMPCODE_DAEMON_STAY_ALIVE_ONLY: '',
            },
        });
        if (child.pid !== undefined) pids.push(child.pid);
        let stderr = '';
        child.stderr?.on('data', (chunk: Buffer) => {
            stderr += String(chunk);
        });
        const code = await exitCode(child, 2000);
        expect(code).toBe(1);
        expect(stderr).toContain('missing LUMPCODE_DAEMON_* env');
    });

    it('supervise spawn uses the foreground child and not an idle timer', async () => {
        const child = aliveDaemonSpawnFn(process.execPath, ['supervise', '--foreground'], {
            detached: true,
        });
        if (child.pid === undefined) throw new Error('supervise stand-in spawned without a pid');
        pids.push(child.pid);
        child.unref();
        await pollUntil({
            timeoutMs: 5000,
            intervalMs: 20,
            timeoutError: 'supervise stand-in did not stay up',
            poll: () => (probeAlive(child.pid as number) ? true : undefined),
        });
        const { stdout } = await execFileAsync('ps', ['-p', String(child.pid), '-o', 'command=']);
        expect(stdout).toContain('daemonForegroundChild.cjs');
        expect(stdout).not.toContain('setInterval');
        process.kill(child.pid, 'SIGTERM');
        await waitUntilGone(child.pid);
    });
});

function exitCode(child: ChildProcess, timeoutMs: number): Promise<number | null> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('child stayed alive')), timeoutMs);
        child.on('exit', (code) => {
            clearTimeout(timer);
            resolve(code);
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
