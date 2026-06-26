import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { LocalConfig } from '../../types/LocalConfig';
import {
    createE2eAgentCommandModule,
    createE2eMockAgentScript,
    defaultE2eLumpConfigJson,
    defaultE2eTsLumpConfig,
    E2E_MOCK_AGENT_SCRIPT_BASENAME,
} from './createE2eAgentCommandModule';
import {
    createE2eCmdShimAgentCommandModule,
    createE2eCmdShimBatchFile,
    e2eCmdShimAgentCommandModuleName,
} from './createE2eCmdShimAgent';
import { git } from './gitHelpers';

export type E2eLumpSpec = {
    name: string;
    configJson?: Record<string, unknown>;
    configJs?: string;
    configTs?: string;
    hookFiles?: Record<string, string>;
    disabled?: boolean;
    maximumNumberOfConcurrentBranches?: number;
    baseBranch?: string;
    discoveryBranch?: string;
    useE2eAgent?: boolean;
    /** When true (Windows E2E), use a `.cmd` shim on PATH instead of the Node mock agent. */
    useCmdShimAgent?: boolean;
    /** When set with `configJs` or `configTs`, writes `<name>.js` or `.ts` under `.lumpcode/commands/`. */
    e2eCommandModule?: string;
    e2eCommandModuleExt?: 'ts' | 'js';
    /** When set, the lump's mock-agent script writes `workspace-cwd.txt` (worktree E2E). */
    e2eMockWriteWorkspaceCwd?: boolean;
};

export type E2eProject = {
    projectRoot: string;
    remoteDir: string;
    homeDir: string;
    globalConfigFolderPath: string;
    projectName: string;
    /** Prepended to PATH for lumpcode subprocesses (e.g. Windows `.cmd` agent shims). */
    pathPrefix?: string;
};

/** `e2e-agent` when the project has one agent lump; `e2e-agent-<lumpName>` when several need distinct marker paths. */
function e2eAgentCommandModuleName(lumpName: string, agentLumpNames: string[]): string {
    return agentLumpNames.length > 1 && agentLumpNames.includes(lumpName)
        ? `e2e-agent-${lumpName}`
        : 'e2e-agent';
}

type ResolvedLumpConfig =
    | { kind: 'ts'; body: string }
    | { kind: 'js'; body: string }
    | { kind: 'json'; body: Record<string, unknown> };

function resolveLumpConfig(lump: E2eLumpSpec, cmd: string): ResolvedLumpConfig {
    if (lump.configTs) return { kind: 'ts', body: lump.configTs };
    if (lump.configJs) return { kind: 'js', body: lump.configJs };
    return {
        kind: 'json',
        body: {
            ...defaultE2eLumpConfigJson(lump.useE2eAgent !== false ? { command: cmd } : {}),
            ...lump.configJson,
            ...(lump.disabled ? { disabled: true } : {}),
            ...(lump.baseBranch ? { baseBranch: lump.baseBranch } : {}),
            ...(lump.discoveryBranch ? { discoveryBranch: lump.discoveryBranch } : {}),
            ...(lump.maximumNumberOfConcurrentBranches !== undefined
                ? { maximumNumberOfConcurrentBranches: lump.maximumNumberOfConcurrentBranches }
                : {}),
        },
    };
}

function commandModuleFilename(moduleName: string, ext: 'ts' | 'js' = 'js'): string {
    if (moduleName.endsWith('.ts') || moduleName.endsWith('.js')) return moduleName;
    return `${moduleName}.${ext}`;
}

/**
 * Scaffolds a git-backed Lumpcode project with a bare remote, isolated HOME,
 * lump configs, and optional e2e agent command modules, then pushes `main`.
 */
export async function createE2eProject(input: {
    projectName?: string;
    localJson?: Partial<LocalConfig>;
    lumps: E2eLumpSpec[];
    useE2eAgent?: boolean;
    extraFiles?: Record<string, string>;
}): Promise<E2eProject> {
    const projectName = input.projectName ?? 'e2e-project';
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-e2e-'));
    const remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-remote-'));
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-home-'));

    git('init --bare', remoteDir);
    git('init -b main', projectRoot);
    git('config user.email "e2e@t.com"', projectRoot);
    git('config user.name "E2E"', projectRoot);
    git('config core.autocrlf false', projectRoot);
    await fs.writeFile(path.join(projectRoot, 'README.md'), '# e2e\n', 'utf-8');
    if (input.extraFiles) {
        for (const [rel, content] of Object.entries(input.extraFiles)) {
            const p = path.join(projectRoot, rel);
            await fs.mkdir(path.dirname(p), { recursive: true });
            await fs.writeFile(p, content, 'utf-8');
        }
    }
    const lumpcodeDir = path.join(projectRoot, '.lumpcode');
    await fs.mkdir(path.join(lumpcodeDir, 'lumps'), { recursive: true });
    await fs.writeFile(path.join(lumpcodeDir, 'project.json'), JSON.stringify({ projectName }), 'utf-8');
    await fs.writeFile(
        path.join(lumpcodeDir, 'local.json'),
        JSON.stringify(
            { mode: 'dedicated', discoveryBranch: 'main', workspaceStrategy: 'checkout', ...input.localJson },
            null,
            2,
        ),
        'utf-8',
    );

    const agentLumps = input.lumps
        .filter((l) => l.useE2eAgent !== false && !l.useCmdShimAgent && !l.e2eCommandModule)
        .map((l) => l.name);
    const cmdShimLumps = input.lumps
        .filter((l) => l.useCmdShimAgent && l.useE2eAgent !== false && !l.configJs && !l.configTs)
        .map((l) => l.name);
    const configJsCommandModules = input.lumps
        .filter((l) => (l.configJs || l.configTs) && l.e2eCommandModule)
        .map((l) => ({
            lumpName: l.name,
            moduleName: l.e2eCommandModule!,
            ext: l.e2eCommandModuleExt ?? 'js',
        }));
    if (
        (input.useE2eAgent ?? true) &&
        (agentLumps.length > 0 || configJsCommandModules.length > 0 || cmdShimLumps.length > 0)
    ) {
        await fs.mkdir(path.join(lumpcodeDir, 'commands'), { recursive: true });
        for (const lumpName of agentLumps) {
            const cmd = e2eAgentCommandModuleName(lumpName, agentLumps);
            await fs.writeFile(
                path.join(lumpcodeDir, 'commands', `${cmd}.js`),
                createE2eAgentCommandModule({ lumpName }),
                'utf-8',
            );
        }
        for (const lumpName of cmdShimLumps) {
            const moduleName = e2eCmdShimAgentCommandModuleName(lumpName, cmdShimLumps);
            await fs.writeFile(
                path.join(lumpcodeDir, 'commands', `${moduleName}.js`),
                createE2eCmdShimAgentCommandModule({ lumpName, cmdShimLumpNames: cmdShimLumps }),
                'utf-8',
            );
        }
        for (const { lumpName, moduleName, ext } of configJsCommandModules) {
            await fs.writeFile(
                path.join(lumpcodeDir, 'commands', commandModuleFilename(moduleName, ext)),
                createE2eAgentCommandModule({ lumpName }),
                'utf-8',
            );
        }
    }

    async function writeLumpConfigFile(lumpDir: string, config: ResolvedLumpConfig): Promise<void> {
        switch (config.kind) {
            case 'ts':
                await fs.writeFile(path.join(lumpDir, 'config.ts'), config.body, 'utf-8');
                break;
            case 'js':
                await fs.writeFile(path.join(lumpDir, 'config.js'), config.body, 'utf-8');
                break;
            case 'json':
                await fs.writeFile(path.join(lumpDir, 'config.json'), JSON.stringify(config.body, null, 2), 'utf-8');
                break;
            default: {
                const _exhaustive: never = config;
                return _exhaustive;
            }
        }
    }

    async function writeE2eMockAgentScript(lumpDir: string, lump: E2eLumpSpec): Promise<void> {
        const usesNamedAgent = lump.useE2eAgent !== false && !lump.useCmdShimAgent && !lump.e2eCommandModule
            && agentLumps.includes(lump.name);
        const usesInlineMock = Boolean(lump.configJs || lump.configTs) && !usesNamedAgent;
        if (!usesInlineMock && !usesNamedAgent) return;
        await fs.writeFile(
            path.join(lumpDir, E2E_MOCK_AGENT_SCRIPT_BASENAME),
            createE2eMockAgentScript({
                lumpName: lump.name,
                writeWorkspaceCwd: lump.e2eMockWriteWorkspaceCwd,
            }),
            'utf-8',
        );
    }

    for (const lump of input.lumps) {
        const lumpDir = path.join(lumpcodeDir, 'lumps', lump.name);
        await fs.mkdir(lumpDir, { recursive: true });
        const cmd = lump.useCmdShimAgent
            ? e2eCmdShimAgentCommandModuleName(lump.name, cmdShimLumps)
            : e2eAgentCommandModuleName(lump.name, agentLumps);
        await writeE2eMockAgentScript(lumpDir, lump);
        if (lump.hookFiles) {
            for (const [rel, content] of Object.entries(lump.hookFiles)) {
                const hookPath = path.join(lumpDir, rel);
                await fs.mkdir(path.dirname(hookPath), { recursive: true });
                await fs.writeFile(hookPath, content, 'utf-8');
            }
        }
        await writeLumpConfigFile(lumpDir, resolveLumpConfig(lump, cmd));
    }

    git('add -A', projectRoot);
    git('commit -m "init"', projectRoot);
    git(`remote add origin ${remoteDir}`, projectRoot);
    git('push -u origin main', projectRoot);

    let pathPrefix: string | undefined;
    if (cmdShimLumps.length > 0) {
        const agentBinDir = path.join(homeDir, 'e2e-agent-bin');
        await fs.mkdir(agentBinDir, { recursive: true });
        for (const lumpName of cmdShimLumps) {
            const executable = e2eCmdShimAgentCommandModuleName(lumpName, cmdShimLumps);
            await fs.writeFile(
                path.join(agentBinDir, `${executable}.cmd`),
                createE2eCmdShimBatchFile({ lumpName }),
                'utf-8',
            );
        }
        pathPrefix = agentBinDir;
    }

    return {
        projectRoot,
        remoteDir,
        homeDir,
        globalConfigFolderPath: path.join(homeDir, '.lumpcode'),
        projectName,
        pathPrefix,
    };
}

/** Deletes the temp directories created by `createE2eProject`. */
export async function destroyE2eProject(p: E2eProject): Promise<void> {
    await rmWithRetry(p.projectRoot);
    await rmWithRetry(p.remoteDir);
    await rmWithRetry(p.homeDir);
}

async function rmWithRetry(dir: string, attempts = 6): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            await fs.rm(dir, { recursive: true, force: true });
            return;
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            const retryable = code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY';
            if (!retryable || attempt === attempts - 1) throw err;
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
    }
}

/** Absolute path to the e2e completion marker on disk under a project or copy root. */
export function e2eMarkerPath(root: string, lumpName: string, contextName: string): string {
    return path.join(root, '.lumpcode', 'e2e-markers', lumpName, `${contextName}.done`);
}

/** Execution workspace path for a project running in `shared` mode (`~/.lumpcode/project-copies/<projectName>`). */
export function sharedModeCopyPath(globalConfigFolderPath: string, projectName: string): string {
    return path.join(globalConfigFolderPath, 'project-copies', projectName);
}

/**
 * Creates and pushes an integration branch from `main`, runs `mutateFn` to add
 * branch-only lumps or files, then returns the checkout to `main`.
 */
export async function pushIntegrationBranch(
    project: E2eProject,
    branchName: string,
    mutateFn: (projectRoot: string) => Promise<void>,
): Promise<void> {
    git(`fetch origin main`, project.projectRoot);
    git(`checkout -b ${branchName} origin/main`, project.projectRoot);
    await mutateFn(project.projectRoot);
    git('add -A', project.projectRoot);
    git(`commit -m "integration ${branchName}"`, project.projectRoot);
    git(`push -u origin ${branchName}`, project.projectRoot);
    git('checkout main', project.projectRoot);
}
