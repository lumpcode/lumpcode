import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { expect } from 'vitest';

import type { LocalConfig } from '../types/LocalConfig';
import { LOCAL_CONFIG_FILE_NAME } from '../utils/readLocalConfig';

export const MINIMAL_RUNNABLE_LUMP_JSON = {
    contextListJson: { NAME: 'README' },
    prompt: { promptTemplate: 'E2E @{NAME}', command: 'e2e-agent' },
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

    gitExec('fetch origin main', projectRoot);
    gitExec(`checkout -b ${branchName} origin/main`, projectRoot);

    for (const [rel, content] of Object.entries(extraFiles)) {
        const filePath = path.join(projectRoot, rel);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
    }

    for (const spec of lumpSpecs) {
        const config = {
            ...MINIMAL_RUNNABLE_LUMP_JSON,
            ...spec.configJson,
            ...spec.configOverrides,
        };
        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', spec.name);
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(path.join(lumpDir, 'config.json'), JSON.stringify(config), 'utf-8');
    }

    gitExec('add -A', projectRoot);
    gitExec(`commit -m "integration branch ${branchName}"`, projectRoot);
    gitExec(`push -u origin ${branchName}`, projectRoot);
    gitExec('checkout main', projectRoot);

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
