import type { SpawnOptions } from 'node:child_process';
import { expect } from 'vitest';

import { command as startCommand } from '../commands/start/main';
import { command as stopCommand } from '../commands/stop/main';
import { resolveDaemonPaths } from '../utils';
import { aliveDaemonSpawnFn } from './aliveDaemonSpawn';
import { waitForDaemonPidFile } from './waitForDaemonPidFile';

export type AliveDaemonTestPaths = {
    pidFilePath: string;
    metaFilePath: string;
    logFilePath: string;
    daemonId: string;
    projectName: string;
};

export async function withAliveDaemon(input: {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    daemonId?: string;
    /** @deprecated equivalent to start `--include=<name>` */
    lumpName?: string;
    include?: string;
    cronSetup?: string;
    /** When true, stop uses `--force`. Default false. */
    forceStop?: boolean;
    /** Extra daemon ids stopped in `finally` after the primary. */
    alsoStopDaemonIds?: string[];
    spawnFn?: (
        command: string,
        args?: readonly string[] | SpawnOptions,
        options?: SpawnOptions,
    ) => unknown;
    run: (paths: AliveDaemonTestPaths) => Promise<void>;
}): Promise<void> {
    const {
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        daemonId,
        lumpName,
        include,
        cronSetup,
        forceStop = false,
        alsoStopDaemonIds = [],
        spawnFn = aliveDaemonSpawnFn,
        run,
    } = input;

    const startResult = await startCommand.handlerMaker({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        spawnFn: spawnFn as typeof aliveDaemonSpawnFn,
        skipEnsureSupervisor: true,
    })({
        options: {
            ...(daemonId !== undefined ? { daemonId } : {}),
            ...(include !== undefined ? { include } : {}),
            ...(lumpName !== undefined ? { lumpName } : {}),
            ...(cronSetup !== undefined ? { cronSetup } : {}),
        },
        arguments: {},
    });
    expect(startResult.success).toBe(true);
    if (!startResult.success) throw new Error('unreachable');
    const startData = startResult.data.data;
    const resolvedId =
        startData !== undefined && 'daemonId' in startData ? startData.daemonId : 'global';

    const pathsResult = await resolveDaemonPaths({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        daemonId: resolvedId,
    });
    if (!pathsResult.success) throw new Error(pathsResult.data);
    const { pidFilePath, metaFilePath, logFilePath, projectName, daemonId: pathsDaemonId } =
        pathsResult.data;
    await waitForDaemonPidFile(pidFilePath);

    const stopHandle = stopCommand.handlerMaker({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
    });
    const stopOptions = forceStop ? { force: true as const } : {};

    try {
        await run({ pidFilePath, metaFilePath, logFilePath, daemonId: pathsDaemonId, projectName });
    } finally {
        for (const id of [resolvedId, ...alsoStopDaemonIds]) {
            await stopHandle({ options: { ...stopOptions, daemonId: id }, arguments: {} });
        }
    }
}
