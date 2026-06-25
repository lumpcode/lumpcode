import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { expect } from 'vitest';

import type { LocalConfig } from '../types/LocalConfig';
import { LOCAL_CONFIG_FILE_NAME } from '../utils/readLocalConfig';

export const MINIMAL_RUNNABLE_LUMP_JSON = {
    contextListJson: { NAME: 'README' },
    prompt: { promptTemplate: 'Improve @{NAME}', command: 'copilot' },
} as const;

export type MultiBranchLumpSpec = {
    name: string;
    configJson?: Record<string, unknown>;
    configOverrides?: Record<string, unknown>;
};

function gitExec(cmd: string, cwd: string): string {
    return execSync(`git ${cmd}`, { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();
}

function shellQuoteBranch(branch: string): string {
    return `'${branch.replace(/'/g, `'\\''`)}'`;
}

function quoteGitPath(relPath: string): string {
    return `'${relPath.replace(/'/g, `'\\''`)}'`;
}

function ensureRemoteBranchExists(projectRoot: string, branchName: string): void {
    gitExec('fetch origin', projectRoot);
    try {
        gitExec(`rev-parse --verify ${shellQuoteBranch(`refs/remotes/origin/${branchName}`)}`, projectRoot);
        return;
    } catch {
        // missing on origin
    }

    const previousBranch = gitCurrentBranch(projectRoot);
    gitExec(`checkout -b ${shellQuoteBranch(branchName)} origin/main`, projectRoot);
    gitExec(`push -u origin ${shellQuoteBranch(branchName)}`, projectRoot);
    gitExec(`checkout ${shellQuoteBranch(previousBranch)}`, projectRoot);
}

export function initBareRemoteAndCheckout(projectRoot: string, remoteDir: string): void {
    gitExec('init --bare', remoteDir);
    gitExec('init -b main', projectRoot);
    gitExec('config user.email "test@test.com"', projectRoot);
    gitExec('config user.name "Test"', projectRoot);
    execSync('printf "# test\\n" > README.md', { cwd: projectRoot, stdio: 'pipe' });
    gitExec('add README.md', projectRoot);
    gitExec('commit -m "init"', projectRoot);
    gitExec(`remote add origin ${remoteDir}`, projectRoot);
    gitExec('push -u origin main', projectRoot);
}

export async function writeLocalJson(
    localConfigFolderPath: string,
    config: Partial<LocalConfig> & Pick<LocalConfig, 'mode'>,
): Promise<void> {
    await fs.writeFile(
        path.join(localConfigFolderPath, LOCAL_CONFIG_FILE_NAME),
        JSON.stringify(config),
        'utf-8',
    );
}

export async function writeMinimalLump(
    projectRoot: string,
    lumpName: string,
    configOverrides: Record<string, unknown> = {},
): Promise<void> {
    const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', lumpName);
    await fs.mkdir(lumpDir, { recursive: true });
    await fs.writeFile(
        path.join(lumpDir, 'config.json'),
        JSON.stringify({ ...MINIMAL_RUNNABLE_LUMP_JSON, ...configOverrides }),
        'utf-8',
    );

    const baseBranch = configOverrides.baseBranch;
    if (typeof baseBranch === 'string' && baseBranch.length > 0) {
        ensureRemoteBranchExists(projectRoot, baseBranch);
    }
}

export function gitCurrentBranch(cwd: string): string {
    return gitExec('rev-parse --abbrev-ref HEAD', cwd);
}

export function assertCheckoutBranch(cwd: string, expected: string): void {
    expect(gitCurrentBranch(cwd)).toBe(expected);
}

function hasRequiredLumpConfigFields(config: Record<string, unknown>): boolean {
    const hasContextSource =
        'contextListJson' in config || 'getContextListFn' in config || 'contextMatchFn' in config;
    const hasPromptSource = 'prompt' in config || 'steps' in config;
    return hasContextSource && hasPromptSource;
}

function buildLumpConfig(spec: MultiBranchLumpSpec): Record<string, unknown> {
    if (
        spec.configJson !== undefined &&
        spec.configOverrides === undefined &&
        !hasRequiredLumpConfigFields(spec.configJson)
    ) {
        return spec.configJson;
    }
    return {
        ...MINIMAL_RUNNABLE_LUMP_JSON,
        ...spec.configJson,
        ...spec.configOverrides,
    };
}

export async function createIntegrationBranch(input: {
    projectRoot: string;
    remoteDir: string;
    branchName: string;
    lumpSpecs?: MultiBranchLumpSpec[];
    extraFiles?: Record<string, string>;
}): Promise<void> {
    const { projectRoot, remoteDir, branchName, lumpSpecs = [], extraFiles = {} } = input;

    gitExec('fetch origin main', projectRoot);
    try {
        gitExec(`rev-parse --verify ${shellQuoteBranch(`refs/heads/${branchName}`)}`, projectRoot);
        gitExec(`checkout ${shellQuoteBranch(branchName)}`, projectRoot);
        gitExec('reset --hard origin/main', projectRoot);
    } catch {
        gitExec(`checkout -b ${shellQuoteBranch(branchName)} origin/main`, projectRoot);
    }

    for (const [rel, content] of Object.entries(extraFiles)) {
        const filePath = path.join(projectRoot, rel);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
        gitExec(`add ${quoteGitPath(rel)}`, projectRoot);
    }

    for (const spec of lumpSpecs) {
        const config = buildLumpConfig(spec);
        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', spec.name);
        await fs.mkdir(lumpDir, { recursive: true });
        const configPath = path.join(lumpDir, 'config.json');
        await fs.writeFile(configPath, JSON.stringify(config), 'utf-8');
        gitExec(`add ${quoteGitPath(path.relative(projectRoot, configPath))}`, projectRoot);
    }

    try {
        gitExec(`commit -m "integration branch ${branchName}"`, projectRoot);
    } catch {
        gitExec(`commit --allow-empty -m "integration branch ${branchName}"`, projectRoot);
    }
    gitExec(`push -u origin ${shellQuoteBranch(branchName)}`, projectRoot);

    let preservedLocalJson: string | undefined;
    let preservedProjectJson: string | undefined;
    const lumpcodeDir = path.join(projectRoot, '.lumpcode');
    const localJsonPath = path.join(lumpcodeDir, LOCAL_CONFIG_FILE_NAME);
    const projectJsonPath = path.join(lumpcodeDir, 'project.json');
    try {
        preservedLocalJson = await fs.readFile(localJsonPath, 'utf-8');
    } catch {
        // no local.json on disk
    }
    try {
        preservedProjectJson = await fs.readFile(projectJsonPath, 'utf-8');
    } catch {
        // no project.json on disk
    }

    gitExec('checkout main', projectRoot);

    await fs.mkdir(lumpcodeDir, { recursive: true });
    if (preservedLocalJson !== undefined) {
        await fs.writeFile(localJsonPath, preservedLocalJson, 'utf-8');
    }
    if (preservedProjectJson !== undefined) {
        await fs.writeFile(projectJsonPath, preservedProjectJson, 'utf-8');
    }

    // Ensure remote has the branch (push from bare perspective)
    void remoteDir;
}

export async function scaffoldMultiBranchProject(input: {
    projectName: string;
    localConfig: Partial<LocalConfig> & Pick<LocalConfig, 'mode'>;
    mainLumps?: MultiBranchLumpSpec[];
    integrationBranches?: Array<{
        branchName: string;
        lumpSpecs?: MultiBranchLumpSpec[];
        extraFiles?: Record<string, string>;
    }>;
}): Promise<{
    projectRoot: string;
    remoteDir: string;
    globalConfigFolderPath: string;
    localConfigFolderPath: string;
}> {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-mbb-'));
    const remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-mbb-remote-'));
    const globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-mbb-global-'));
    const localConfigFolderPath = path.join(projectRoot, '.lumpcode');

    initBareRemoteAndCheckout(projectRoot, remoteDir);
    await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
    await fs.writeFile(
        path.join(localConfigFolderPath, 'project.json'),
        JSON.stringify({ projectName: input.projectName }),
        'utf-8',
    );
    await writeLocalJson(localConfigFolderPath, input.localConfig);

    for (const spec of input.mainLumps ?? []) {
        await writeMinimalLump(projectRoot, spec.name, {
            ...spec.configJson,
            ...spec.configOverrides,
        });
    }

    if ((input.mainLumps ?? []).length > 0 || Object.keys(input.localConfig).length > 0) {
        gitExec('add -A', projectRoot);
        gitExec('commit -m "main lumps"', projectRoot);
        gitExec('push origin main', projectRoot);
    }

    for (const branch of input.integrationBranches ?? []) {
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: branch.branchName,
            lumpSpecs: branch.lumpSpecs,
            extraFiles: branch.extraFiles,
        });
    }

    return { projectRoot, remoteDir, globalConfigFolderPath, localConfigFolderPath };
}
