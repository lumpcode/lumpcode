/** Env var set on e2e CLI children: Vitest worker Node binary (SEA `process.execPath` is the lumpcode exe). */
export const LUMPCODE_E2E_NODE_ENV = 'LUMPCODE_E2E_NODE';

/** Process env for CLI subprocesses: isolated profile dir and Vitest worker markers stripped. */
export function subprocessEnv(homeDir: string, options?: { pathPrefix?: string }): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: homeDir,
        [LUMPCODE_E2E_NODE_ENV]: process.execPath,
    };
    if (options?.pathPrefix) {
        const delimiter = process.platform === 'win32' ? ';' : ':';
        env.PATH = `${options.pathPrefix}${delimiter}${process.env.PATH ?? ''}`;
    }
    if (process.platform === 'win32') {
        env.USERPROFILE = homeDir;
        delete env.HOMEDRIVE;
        delete env.HOMEPATH;
    }
    delete env.VITEST;
    delete env.VITEST_WORKER_ID;
    delete env.VITEST_POOL_ID;
    return env;
}
