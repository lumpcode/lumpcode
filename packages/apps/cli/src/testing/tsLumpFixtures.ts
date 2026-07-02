import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export type TsLumpProjectContext = {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    lumpDir: string;
    lumpName: string;
};

/** Shared inline lump config for lump-plan command tests (P3). */
export const LUMP_PLAN_COMMAND_CONFIG_TS = `export default {
  getContextListFn: () => [{ name: 'alpha', variables: {} }],
  prompt: {
    promptFn: () => 'hello',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};
`;

/** Shared inline lump config for planLumpFromJsConfig tests (P1). */
export const LUMP_PLAN_UTIL_CONFIG_TS = `export default {
  getContextListFn: () => [{ name: 'ctx1', variables: { FILE: 'a.ts' } }],
  prompt: {
    promptFn: () => 'preview prompt',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};
`;

export async function withTsLumpProject(
    fn: (ctx: TsLumpProjectContext) => Promise<void>,
    options: {
        lumpName?: string;
        globalConfigFolderPath?: string;
        /** Scaffold only global `.lumpcode/commands` (transpile cache under global tree). */
        fixture?: 'project' | 'global-command';
    } = {},
): Promise<void> {
    const lumpName = options.lumpName ?? 'my-lump';
    const fixture = options.fixture ?? 'project';
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lumpcode-ts-fixture-'));
    try {
        const projectRoot = root;
        const localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        const globalConfigFolderPath =
            options.globalConfigFolderPath ?? path.join(root, 'global', '.lumpcode');
        const lumpDir = path.join(localConfigFolderPath, 'lumps', lumpName);

        await fs.mkdir(path.join(globalConfigFolderPath, 'commands', 'presets'), { recursive: true });
        if (fixture === 'global-command') {
            await fn({
                projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
                lumpDir,
                lumpName,
            });
            return;
        }

        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'dedicated', primaryBranch: 'main' }),
            'utf-8',
        );
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'ts-fixture-project' }),
            'utf-8',
        );

        await fn({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            lumpDir,
            lumpName,
        });
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
}

export async function writeLumpConfigTs(lumpDir: string, body: string): Promise<string> {
    const configPath = path.join(lumpDir, 'config.ts');
    await fs.writeFile(configPath, body, 'utf-8');
    return configPath;
}

export async function writeLumpHookTs(lumpDir: string, name: string, body: string): Promise<string> {
    const hookPath = path.join(lumpDir, name);
    await fs.mkdir(path.dirname(hookPath), { recursive: true });
    await fs.writeFile(hookPath, body, 'utf-8');
    return hookPath;
}

export async function writeCommandModuleTs(commandsDir: string, name: string, body: string): Promise<string> {
    await fs.mkdir(commandsDir, { recursive: true });
    const commandPath = path.join(commandsDir, `${name}.ts`);
    await fs.writeFile(commandPath, body, 'utf-8');
    return commandPath;
}

export type TranspileCacheMeta = {
    hashDir: string;
    metaPath: string;
    meta: Record<string, unknown>;
    outPath: string;
};

export async function readCacheMeta(projectRoot: string): Promise<TranspileCacheMeta[]> {
    const cacheRoot = path.join(projectRoot, '.lumpcode', '.cache', 'transpile');
    let entries: string[];
    try {
        entries = await fs.readdir(cacheRoot);
    } catch {
        return [];
    }

    const results: TranspileCacheMeta[] = [];
    for (const hashDir of entries) {
        const hashPath = path.join(cacheRoot, hashDir);
        const metaPath = path.join(hashPath, 'meta.json');
        try {
            const raw = await fs.readFile(metaPath, 'utf-8');
            results.push({
                hashDir,
                metaPath,
                meta: JSON.parse(raw) as Record<string, unknown>,
                outPath: path.join(hashPath, 'out.mjs'),
            });
        } catch {
            continue;
        }
    }
    return results;
}
