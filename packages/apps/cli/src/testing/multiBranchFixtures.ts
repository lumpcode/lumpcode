import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { expect } from 'vitest';

import type { LocalConfig } from '../types/LocalConfig';
import { LOCAL_CONFIG_FILE_NAME } from '../utils/readLocalConfig';

export const MINIMAL_RUNNABLE_LUMP_JSON = {
    contextListJson: { NAME: 'README' },
    prompt: { promptTemplate: 'E2E @{NAME}', command: 'copilot' },
} as const;

export type MultiBranchLumpSpec = {
    name: string;
    configJson?: Record<string, unknown>;
    configOverrides?: Record<string, unknown>;
};

function gitExec(cmd: string, cwd: string): string {
    return execSync(`git ${cmd}`, { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();
}

export function initBareRemoteAndCheckout(projectRoot: string, remoteDir: string): void {
    gitExec('init --bare', remoteDir);
    gitExec('init -b main', projectRoot);
    gitExec('config user.email "test@test.com"', projectRoot);
    gitExec('config user.name "Test"', projectRoot);
    gitExec('commit --allow-empty -m "init"', projectRoot);
    gitExec(`remote add origin ${remoteDir}`, projectRoot);
    gitExec('push -u origin main', projectRoot);
    // Mirror project-setup: keep machine-local config out of integration-branch commits.
    const gitignorePath = path.join(projectRoot, '.gitignore');
    try {
        const existing = fsSync.readFileSync(gitignorePath, 'utf-8');
        if (!existing.includes('.lumpcode/local.json')) {
            fsSync.appendFileSync(
                gitignorePath,
                `${existing.endsWith('\n') ? '' : '\n'}.lumpcode/local.json\n`,
            );
        }
    } catch {
        fsSync.writeFileSync(gitignorePath, '.lumpcode/local.json\n');
    }
}

export async function writeLocalJson(
    localConfigFolderPath: string,
    config: Partial<LocalConfig> & Pick<LocalConfig, 'mode'>,
): Promise<void> {
    const projectRoot = path.dirname(localConfigFolderPath);
    const gitignorePath = path.join(projectRoot, '.gitignore');
    let gitignore = '';
    try {
        gitignore = await fs.readFile(gitignorePath, 'utf-8');
    } catch {
        gitignore = '';
    }
    if (!gitignore.split(/\r?\n/).includes('.lumpcode/local.json')) {
        const prefix = gitignore.length === 0 ? '' : gitignore.endsWith('\n') ? '' : '\n';
        await fs.appendFile(gitignorePath, `${prefix}.lumpcode/local.json\n`, 'utf-8');
    }

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
}

export function gitCurrentBranch(cwd: string): string {
    return gitExec('rev-parse --abbrev-ref HEAD', cwd);
}

export function assertCheckoutBranch(cwd: string, expected: string): void {
    expect(gitCurrentBranch(cwd)).toBe(expected);
}

export async function createIntegrationBranch(input: {
    projectRoot: string;
    remoteDir: string;
    branchName: string;
    lumpSpecs?: MultiBranchLumpSpec[];
    extraFiles?: Record<string, string>;
}): Promise<void> {
    const { projectRoot, remoteDir, branchName, lumpSpecs = [], extraFiles = {} } = input;

    const lumpcodeDir = path.join(projectRoot, '.lumpcode');
    const localJsonPath = path.join(lumpcodeDir, LOCAL_CONFIG_FILE_NAME);
    const projectJsonPath = path.join(lumpcodeDir, 'project.json');
    const savedLocalJson = await fs.readFile(localJsonPath, 'utf-8').catch(() => null);
    const savedProjectJson = await fs.readFile(projectJsonPath, 'utf-8').catch(() => null);

    await commitLumpcodeMetadataOnCurrentBranch(projectRoot);
    await commitMainLumpsIfPresent(projectRoot);

    gitExec('fetch origin main', projectRoot);
    gitExec(`checkout -b ${branchName} origin/main`, projectRoot);

    for (const [rel, content] of Object.entries(extraFiles)) {
        const filePath = path.join(projectRoot, rel);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
    }

    for (const spec of lumpSpecs) {
        const config =
            spec.configOverrides !== undefined
                ? {
                      ...MINIMAL_RUNNABLE_LUMP_JSON,
                      ...spec.configJson,
                      ...spec.configOverrides,
                  }
                : spec.configJson !== undefined
                  ? spec.configJson
                  : { ...MINIMAL_RUNNABLE_LUMP_JSON };
        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', spec.name);
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(path.join(lumpDir, 'config.json'), JSON.stringify(config), 'utf-8');
    }

    const pathsToStage = [
        ...Object.keys(extraFiles),
        ...lumpSpecs.map((spec) => `.lumpcode/lumps/${spec.name}`),
    ];
    if (pathsToStage.length > 0) {
        gitExec(`add -- ${pathsToStage.join(' ')}`, projectRoot);
    }
    try {
        gitExec(`commit -m "integration branch ${branchName}"`, projectRoot);
    } catch {
        gitExec(`commit --allow-empty -m "integration branch ${branchName}"`, projectRoot);
    }
    gitExec(`push -u origin ${branchName}`, projectRoot);
    gitExec('checkout main', projectRoot);

    await fs.mkdir(lumpcodeDir, { recursive: true });
    if (savedProjectJson !== null) {
        await fs.writeFile(projectJsonPath, savedProjectJson, 'utf-8');
    }
    if (savedLocalJson !== null) {
        await fs.writeFile(localJsonPath, savedLocalJson, 'utf-8');
    }

    void remoteDir;
}

async function commitMainLumpsIfPresent(projectRoot: string): Promise<void> {
    const lumpsDir = path.join(projectRoot, '.lumpcode/lumps');
    if (!(await fs.access(lumpsDir).then(() => true).catch(() => false))) {
        return;
    }
    gitExec('add .lumpcode/lumps', projectRoot);
    const porcelain = gitExec('status --porcelain .lumpcode/lumps', projectRoot);
    if (!porcelain) {
        return;
    }
    gitExec('commit -m "lump configs"', projectRoot);
    const branch = gitCurrentBranch(projectRoot);
    try {
        gitExec(`push origin ${branch}`, projectRoot);
    } catch {
        gitExec('push -u origin HEAD', projectRoot);
    }
}

async function commitLumpcodeMetadataOnCurrentBranch(projectRoot: string): Promise<void> {
    const pathsToAdd: string[] = [];
    const gitignorePath = path.join(projectRoot, '.gitignore');
    const projectJsonPath = path.join(projectRoot, '.lumpcode', 'project.json');

    if (await fs.access(projectJsonPath).then(() => true).catch(() => false)) {
        pathsToAdd.push('.lumpcode/project.json');
    }
    if (await fs.access(gitignorePath).then(() => true).catch(() => false)) {
        pathsToAdd.push('.gitignore');
    }
    if (pathsToAdd.length === 0) return;

    gitExec(`add ${pathsToAdd.join(' ')}`, projectRoot);
    const porcelain = gitExec('status --porcelain', projectRoot);
    if (!porcelain) return;

    gitExec('commit -m "lumpcode metadata"', projectRoot);
    const branch = gitCurrentBranch(projectRoot);
    try {
        gitExec(`push origin ${branch}`, projectRoot);
    } catch {
        gitExec('push -u origin HEAD', projectRoot);
    }
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
