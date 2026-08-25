import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createTempTestDirs, initLocalGitRepo, writeLumpConfigJson } from '../utils';
import { setDaemonTestGlobalConfigFolder } from './daemonTestEnv';
import { writeLocalJson, writeProjectJson } from './multiBranchFixtures';

export type DaemonCommandTestProject = {
    projectRoot: string;
    globalConfigFolderPath: string;
    localConfigFolderPath: string;
    projectName: string;
};

/** Temp dedicated-mode project for daemon companion tests (no bare remote). */
export async function createDaemonCommandTestProject(input: {
    prefix: string;
    projectName: string;
    lumpName?: string;
    /** Default true; false when the suite never starts a detached daemon. */
    bindDaemonTestEnv?: boolean;
}): Promise<DaemonCommandTestProject> {
    const { prefix, projectName, lumpName = 'alpha', bindDaemonTestEnv = true } = input;
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath } = await createTempTestDirs({
        prefix,
        remote: false,
    });
    if (bindDaemonTestEnv) setDaemonTestGlobalConfigFolder(globalConfigFolderPath);
    initLocalGitRepo({ cwd: projectRoot });
    await writeLumpConfigJson({ localConfigFolderPath, lumpName });
    await writeProjectJson(localConfigFolderPath, { projectName });
    await writeLocalJson(localConfigFolderPath, { mode: 'dedicated', primaryBranch: 'main' });
    await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
    return { projectRoot, globalConfigFolderPath, localConfigFolderPath, projectName };
}
