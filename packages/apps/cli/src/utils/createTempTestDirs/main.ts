import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export type CreateTempTestDirsInput = {
    /** Prefix for `projectRoot` mkdtemp (callers include trailing `-`). */
    prefix: string;
    /** Default true → `${prefix}remote-` (or `${prefix}-remote-`). */
    remote?: boolean;
    /** Default true → analogous `global-` sibling. */
    global?: boolean;
    /** Default true → mkdir `projectRoot/.lumpcode`. */
    mkdirLocalConfig?: boolean;
};

export type TempTestDirs = {
    projectRoot: string;
    localConfigFolderPath: string;
    remoteDir?: string;
    globalConfigFolderPath?: string;
};

type TempTestDirsFor<I extends CreateTempTestDirsInput> = {
    projectRoot: string;
    localConfigFolderPath: string;
} & (I['remote'] extends false ? { remoteDir?: undefined } : { remoteDir: string }) &
    (I['global'] extends false ? { globalConfigFolderPath?: undefined } : { globalConfigFolderPath: string });

function siblingPrefix(prefix: string, kind: 'remote' | 'global'): string {
    return `${prefix}${prefix.endsWith('-') ? '' : '-'}${kind}-`;
}

export async function createTempTestDirs<const I extends CreateTempTestDirsInput>(
    input: I,
): Promise<TempTestDirsFor<I>> {
    const { prefix, remote = true, global = true, mkdirLocalConfig = true } = input;
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    const localConfigFolderPath = path.join(projectRoot, '.lumpcode');
    const remoteDir = remote
        ? await fs.mkdtemp(path.join(os.tmpdir(), siblingPrefix(prefix, 'remote')))
        : undefined;
    const globalConfigFolderPath = global
        ? await fs.mkdtemp(path.join(os.tmpdir(), siblingPrefix(prefix, 'global')))
        : undefined;
    if (mkdirLocalConfig) await fs.mkdir(localConfigFolderPath, { recursive: true });
    return { projectRoot, localConfigFolderPath, remoteDir, globalConfigFolderPath } as TempTestDirsFor<I>;
}

export async function removeTempTestDirs(
    dirs: Pick<TempTestDirs, 'projectRoot' | 'remoteDir' | 'globalConfigFolderPath'>,
): Promise<void> {
    await Promise.all(
        [dirs.projectRoot, dirs.remoteDir, dirs.globalConfigFolderPath]
            .filter((p): p is string => p !== undefined)
            .map((p) => fs.rm(p, { recursive: true, force: true })),
    );
}
