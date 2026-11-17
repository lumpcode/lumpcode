import { readFileSync, unlinkSync } from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn as nodeSpawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';

import { getDaemonTestGlobalConfigFolder } from './daemonTestEnv';

const childScript = fileURLToPath(new URL('./daemonForegroundChild.cjs', import.meta.url));

/**
 * One unref'd server for this test process. Children connect and stay up only
 * while the socket is open, so they exit when this process dies — including
 * SIGKILL, which reparents them to init. Accepted sockets are unref'd (so the
 * test run can finish) and retained (so GC does not close them early).
 */
let parentWatch:
    | { server: net.Server; sockPath: string; sockets: Set<net.Socket> }
    | undefined;

function parentWatchAddress(): string {
    if (process.platform === 'win32') {
        return `\\\\.\\pipe\\lumpcode-daemon-test-parent-${process.pid}`;
    }
    return path.join(os.tmpdir(), `lumpcode-daemon-test-parent-${process.pid}.sock`);
}

function ensureParentWatchServer(): string {
    if (parentWatch) return parentWatch.sockPath;

    const sockPath = parentWatchAddress();
    if (process.platform !== 'win32') {
        try {
            unlinkSync(sockPath);
        } catch {
            // absent
        }
    }

    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
        socket.unref();
        sockets.add(socket);
        socket.on('close', () => {
            sockets.delete(socket);
        });
    });
    server.unref();
    server.on('error', () => {
        // A listen failure must not crash the test runner. The child exits if it cannot attach.
    });
    server.listen(sockPath);
    process.on('exit', () => {
        if (process.platform === 'win32') return;
        try {
            unlinkSync(sockPath);
        } catch {
            // already gone
        }
    });
    // Retain the server. An unref'd handle with no JS reference can be collected and closed.
    parentWatch = { server, sockPath, sockets };
    return sockPath;
}

function spawnEnv(options: SpawnOptions, extra: Record<string, string>): NodeJS.ProcessEnv {
    const fromOptions =
        typeof options.env === 'object' && options.env !== null && !Array.isArray(options.env)
            ? options.env
            : {};
    return {
        ...process.env,
        ...fromOptions,
        ...extra,
        LUMPCODE_DAEMON_PARENT_PID: String(process.pid),
        LUMPCODE_DAEMON_PARENT_SOCK: ensureParentWatchServer(),
    };
}

function parseSpawnArg(args: readonly string[], flag: string): string | undefined {
    const index = args.indexOf(flag);
    if (index < 0 || index + 1 >= args.length) {
        return undefined;
    }
    return args[index + 1];
}

/**
 * Spawn fn for daemon command tests: starts a detached child that writes PID/meta
 * the same way foreground `start` does, then stays alive for stop/status checks.
 * The child exits when this test process dies, so a run that never reaches stop
 * cannot leave an orphan idling under init.
 */
export const aliveDaemonSpawnFn: typeof nodeSpawn = ((
    execPath: string,
    args: readonly string[],
    options: SpawnOptions,
) => {
    if (args.includes('supervise')) {
        return nodeSpawn(execPath, [childScript], {
            ...options,
            stdio: 'ignore',
            env: spawnEnv(options, { LUMPCODE_DAEMON_STAY_ALIVE_ONLY: '1' }),
        });
    }

    const daemonId = parseSpawnArg(args, '--daemonId') ?? 'global';
    const include = parseSpawnArg(args, '--include') ?? '';
    const exclude = parseSpawnArg(args, '--exclude') ?? '';
    const cronSetup = parseSpawnArg(args, '--cronSetup') ?? '*/5 * * * *';
    let workspaceStrategy = 'checkout';
    const projectRoot = options.cwd ? String(options.cwd) : '';
    if (projectRoot) {
        try {
            const local = JSON.parse(
                readFileSync(path.join(projectRoot, '.lumpcode', 'local.json'), 'utf8'),
            ) as { workspaceStrategy?: string };
            if (local.workspaceStrategy === 'worktree' || local.workspaceStrategy === 'checkout') {
                workspaceStrategy = local.workspaceStrategy;
            }
        } catch {
            // keep default
        }
    }

    return nodeSpawn(execPath, [childScript], {
        ...options,
        stdio: 'ignore',
        env: spawnEnv(options, {
            LUMPCODE_DAEMON_PROJECT_ROOT: projectRoot,
            LUMPCODE_DAEMON_GLOBAL_CONFIG: getDaemonTestGlobalConfigFolder(),
            LUMPCODE_DAEMON_CRON_SETUP: cronSetup,
            LUMPCODE_DAEMON_ID: daemonId,
            LUMPCODE_DAEMON_INCLUDE: include,
            LUMPCODE_DAEMON_EXCLUDE: exclude,
            LUMPCODE_DAEMON_WORKSPACE_STRATEGY: workspaceStrategy,
            LUMPCODE_DAEMON_STAY_ALIVE_ONLY: '',
        }),
    });
}) as typeof nodeSpawn;
