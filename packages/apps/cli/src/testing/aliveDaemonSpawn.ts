import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn as nodeSpawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';

import { getDaemonTestGlobalConfigFolder } from './daemonTestEnv';

const childScript = fileURLToPath(new URL('./daemonForegroundChild.cjs', import.meta.url));

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
 */
export const aliveDaemonSpawnFn: typeof nodeSpawn = ((
    execPath: string,
    args: readonly string[],
    options: SpawnOptions,
) => {
    const lumpName = parseSpawnArg(args, '--lumpName');
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
        env: {
            ...process.env,
            ...(typeof options.env === 'object' && options.env !== null && !Array.isArray(options.env)
                ? options.env
                : {}),
            LUMPCODE_DAEMON_PROJECT_ROOT: projectRoot,
            LUMPCODE_DAEMON_GLOBAL_CONFIG: getDaemonTestGlobalConfigFolder(),
            LUMPCODE_DAEMON_CRON_SETUP: cronSetup,
            LUMPCODE_DAEMON_LUMP_NAME: lumpName ?? '',
            LUMPCODE_DAEMON_WORKSPACE_STRATEGY: workspaceStrategy,
        },
    });
}) as typeof nodeSpawn;
