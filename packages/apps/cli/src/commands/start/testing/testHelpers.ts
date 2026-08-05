import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect } from 'vitest';
import { success } from '@lumpcode/core';

import {
    aliveDaemonSpawnFn,
    setDaemonTestGlobalConfigFolder,
    waitForDaemonPidFile,
    writeLocalJson,
    writeMinimalLump,
} from '../../../testing';
import { command as stopCommand } from '../../stop/main';
import { command } from '../main';
import { execGit } from '../../../utils/execGit';
import { resolveDaemonPaths } from '../../../utils/resolveDaemonPaths';

export type StartTestProject = {
    projectRoot: string;
    remoteDir: string;
    globalConfigFolderPath: string;
};

export type StartHandlerDeps = StartTestProject & {
    localConfigFolderPath?: string;
};

export type PromiseGate = {
    resolve: () => void;
    promise: Promise<void>;
};

export function localConfigFolderPath(projectRoot: string): string {
    return path.join(projectRoot, '.lumpcode');
}

export function makePromiseGate(): PromiseGate {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { resolve, promise };
}

export const runLumpSuccess = success({
    skipped: false as const,
    result: {
        branchName: 'lump/x',
        contextNames: [] as string[],
        contextRunStateList: [],
    },
});

export async function writeDefaultProjectJson(projectRoot: string, projectName: string) {
    await fs.writeFile(
        path.join(projectRoot, '.lumpcode', 'project.json'),
        JSON.stringify({ projectName }),
        'utf-8',
    );
}

export async function writeDefaultLocalJson(
    projectRoot: string,
    overrides: { disabled?: boolean; workspaceStrategy?: 'checkout' | 'worktree' } = {},
) {
    await fs.writeFile(
        path.join(projectRoot, '.lumpcode', 'local.json'),
        JSON.stringify({ mode: 'dedicated', primaryBranch: 'main', ...overrides }),
        'utf-8',
    );
}

export async function setupStartTestRepo(options: {
    tmpPrefix: string;
    projectName?: string;
}): Promise<StartTestProject> {
    const { tmpPrefix, projectName } = options;
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), `${tmpPrefix}-`));
    const remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), `${tmpPrefix}-remote-`));
    const globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), `${tmpPrefix}-global-`));
    setDaemonTestGlobalConfigFolder(globalConfigFolderPath);
    execGit('init --bare', remoteDir);
    execGit('init -b main', projectRoot);
    execGit('config user.email "test@test.com"', projectRoot);
    execGit('config user.name "Test"', projectRoot);
    execGit('commit --allow-empty -m "init"', projectRoot);
    execGit(`remote add origin ${remoteDir}`, projectRoot);
    execGit('push -u origin main', projectRoot);
    await fs.mkdir(path.join(projectRoot, '.lumpcode', 'lumps'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
    await writeDefaultProjectJson(projectRoot, projectName ?? 'start-test-project');
    return { projectRoot, remoteDir, globalConfigFolderPath };
}

export async function teardownStartTestRepo(project: StartTestProject): Promise<void> {
    await fs.rm(project.projectRoot, { recursive: true, force: true });
    await fs.rm(project.remoteDir, { recursive: true, force: true });
    await fs.rm(project.globalConfigFolderPath, { recursive: true, force: true });
}

export function makeStartHandler(
    deps: StartHandlerDeps,
    overrides: Partial<Parameters<typeof command.handlerMaker>[0]> = {},
) {
    return command.handlerMaker({
        projectRoot: deps.projectRoot,
        localConfigFolderPath:
            deps.localConfigFolderPath ?? localConfigFolderPath(deps.projectRoot),
        globalConfigFolderPath: deps.globalConfigFolderPath,
        ...overrides,
    });
}

export async function runDetachedStart(
    deps: StartHandlerDeps,
    options: {
        daemonId?: string;
        include?: string;
        lumpName?: string;
        cronSetup?: string;
        spawnFn?: typeof aliveDaemonSpawnFn;
    } = {},
) {
    const { daemonId, include, lumpName, cronSetup, spawnFn = aliveDaemonSpawnFn } = options;
    const handle = makeStartHandler(deps, { spawnFn });
    const result = await handle({
        options: {
            ...(daemonId !== undefined ? { daemonId } : {}),
            ...(include !== undefined ? { include } : {}),
            ...(lumpName !== undefined ? { lumpName } : {}),
            ...(cronSetup !== undefined ? { cronSetup } : {}),
        },
        arguments: {},
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    const resolvedId = result.data.data?.daemonId ?? 'global';

    const pathsResult = await resolveDaemonPaths({
        projectRoot: deps.projectRoot,
        localConfigFolderPath:
            deps.localConfigFolderPath ?? localConfigFolderPath(deps.projectRoot),
        globalConfigFolderPath: deps.globalConfigFolderPath,
        daemonId: resolvedId,
    });
    if (!pathsResult.success) {
        throw new Error(pathsResult.data);
    }
    await waitForDaemonPidFile(pathsResult.data.pidFilePath);
}

export async function stopDaemon(
    deps: StartHandlerDeps,
    options: { daemonId?: string; lumpName?: string } = {},
) {
    const handle = stopCommand.handlerMaker({
        projectRoot: deps.projectRoot,
        localConfigFolderPath:
            deps.localConfigFolderPath ?? localConfigFolderPath(deps.projectRoot),
        globalConfigFolderPath: deps.globalConfigFolderPath,
    });
    await handle({
        options: {
            ...(options.daemonId !== undefined ? { daemonId: options.daemonId } : {}),
            ...(options.lumpName !== undefined ? { lumpName: options.lumpName } : {}),
        },
        arguments: {},
    });
}

export function daemonMetaPath(
    globalConfigFolderPath: string,
    projectName: string,
    daemonId = 'global',
): string {
    return path.join(globalConfigFolderPath, 'daemons', `${projectName}.${daemonId}.daemon.meta.json`);
}

export async function writeCommittedLumps(
    projectRoot: string,
    names: string[],
    configExtra: Record<string, unknown> = {},
    commitMessage = 'add lumps',
): Promise<void> {
    for (const name of names) {
        await writeMinimalLump(projectRoot, name, configExtra);
    }
    execGit('add -A', projectRoot);
    execGit(`commit -m "${commitMessage}"`, projectRoot);
    execGit('push origin main', projectRoot);
}

export async function writeDedicatedLocal(
    projectRoot: string,
    overrides: Record<string, unknown> = {},
): Promise<void> {
    await writeLocalJson(localConfigFolderPath(projectRoot), {
        mode: 'dedicated',
        primaryBranch: 'main',
        ...overrides,
    });
}
