import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { success } from '@lumpcode/core';

import {
    setDaemonTestGlobalConfigFolder,
    writeLocalJson,
    writeMinimalLump,
} from '../../../testing';
import { command, defaultCronPattern, type Input } from '../main';
import {
    createTempTestDirs,
    daemonSchedulerFiles,
    daemonsDirPath,
    execGit,
    initBareRemoteAndCheckout,
    removeTempTestDirs,
    writeJsonFile,
} from '../../../utils';

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
    await writeJsonFile({
        filePath: path.join(projectRoot, '.lumpcode', 'project.json'),
        data: { projectName },
    });
}

export async function writeDefaultLocalJson(
    projectRoot: string,
    overrides: { disabled?: boolean; workspaceStrategy?: 'checkout' | 'worktree' } = {},
) {
    await writeJsonFile({
        filePath: path.join(projectRoot, '.lumpcode', 'local.json'),
        data: { mode: 'dedicated', primaryBranch: 'main', ...overrides },
    });
}

export async function setupStartTestRepo(options: {
    tmpPrefix: string;
    projectName?: string;
}): Promise<StartTestProject> {
    const { tmpPrefix, projectName } = options;
    const { projectRoot, remoteDir, globalConfigFolderPath } = await createTempTestDirs({ prefix: `${tmpPrefix}-` });
    setDaemonTestGlobalConfigFolder(globalConfigFolderPath);
    initBareRemoteAndCheckout({ projectRoot, remoteDir });
    await fs.mkdir(path.join(projectRoot, '.lumpcode', 'lumps'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
    await writeDefaultProjectJson(projectRoot, projectName ?? 'start-test-project');
    return { projectRoot, remoteDir, globalConfigFolderPath };
}

export async function teardownStartTestRepo(project: StartTestProject): Promise<void> {
    await removeTempTestDirs(project);
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
        skipEnsureSupervisor: true,
        ...overrides,
    });
}

export function runForegroundStart(input: {
    deps: StartHandlerDeps;
    /** Merged after foreground + default cron, so callers can override either. */
    options?: Partial<Input['options']>;
    /**
     * Foreground tests must not block on SIGINT.
     * Omitted means an already-resolved shutdown (`async () => {}`).
     * Pass a gate or assertion callback when the test has to observe mid-tick state.
     */
    waitForShutdownOverride?: () => Promise<void>;
}): ReturnType<ReturnType<typeof command.handlerMaker>> {
    const {
        deps,
        options,
        waitForShutdownOverride = async () => {},
    } = input;

    return makeStartHandler(deps, { waitForShutdownOverride })({
        options: {
            foreground: true,
            cronSetup: defaultCronPattern,
            ...options,
        },
        arguments: {},
    });
}

export function daemonMetaPath(
    globalConfigFolderPath: string,
    projectName: string,
    daemonId = 'global',
): string {
    return daemonSchedulerFiles({
        daemonsDir: daemonsDirPath({ globalConfigFolderPath }),
        projectName,
        daemonId,
    }).metaFilePath;
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
