import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { failure, success } from '@lumpcode/core';

import type { SetupPrompter } from '../main';
import { command } from '../main';
import {
    createTempTestDirs,
    initBareRemoteAndCheckout,
    removeTempTestDirs,
    writeJsonFile,
} from '../../../utils';

export const SETUP_GITIGNORE_LINES = [
    '.lumpcode/**/contextStatusRecord.json',
    '.lumpcode/**/history/',
    '.lumpcode/worktrees/',
    '.lumpcode/.cache/',
    '.lumpcode/local.json',
] as const;

export const WORKER_DOCS_URL = 'https://www.lumpcode.com/docs/start/worker';
export const AGENTS_DOCS_URL = 'https://www.lumpcode.com/docs/author/agents';

export const DEFAULT_LUMP_NAME = 'myFirstLump';
export const RUN_SUCCESS_BRANCH = `lump/${DEFAULT_LUMP_NAME}/README`;
export const SETUP_PROMPT = 'clean and improve the code in @{FILE}';

export const AGENT_BINARIES = ['cursor-agent', 'copilot', 'claude', 'opencode', 'codex'] as const;

export type PromptCall =
    | { kind: 'confirm'; message: string; defaultValue: boolean }
    | { kind: 'select'; message: string; choices: { value: string; label: string }[] }
    | { kind: 'input'; message: string; defaultValue?: string }
    | { kind: 'pause'; message: string };

export type ScriptedPrompter = SetupPrompter & { calls: PromptCall[] };

export type SetupTestProject = {
    projectRoot: string;
    remoteDir: string;
    homeDir: string;
    globalConfigFolderPath: string;
    restoreEnv: () => void;
};

export function messagesText(messages: string[]): string {
    return messages.join('\n');
}

export function planContextsSuccess(input: {
    projectRoot: string;
    lumpName?: string;
    contexts?: Array<{ name: string; variables: Record<string, string> }>;
    mode?: string;
}) {
    const lumpName = input.lumpName ?? DEFAULT_LUMP_NAME;
    return success({
        lumpName,
        valid: true as const,
        disabled: false,
        discoveryBranch: 'main',
        baseBranch: 'main',
        executionWorkspacePath: input.projectRoot,
        mode: input.mode ?? 'shared',
        workspaceStrategy: 'checkout',
        contexts: input.contexts ?? [{ name: 'README', variables: { FILE: 'README.md' } }],
    });
}

export function runLumpSuccess(branchName = RUN_SUCCESS_BRANCH) {
    return success({
        skipped: false as const,
        result: {
            branchName,
            contextNames: ['README'],
            contextRunStateList: [],
        },
    });
}

export function launchStartDaemonSuccess() {
    return success({
        messages: ['started'],
        data: {
            cronSetup: '*/5 * * * *',
            lumpNames: [DEFAULT_LUMP_NAME],
            ticks: 0,
            daemonId: 'global',
        },
    });
}

export function execFailure(commandLine: string) {
    return failure({
        message: `failed: ${commandLine}`,
        reason: 'exit' as const,
        info: { command: commandLine, stdout: '', stderr: 'mocked failure' },
    });
}

function gitBinDir(): string {
    try {
        const git = process.platform === 'win32'
            ? execFileSync('where', ['git'], { encoding: 'utf8' }).split(/\r?\n/)[0]?.trim()
            : execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
        return git ? path.dirname(git) : process.platform === 'win32' ? 'C:\\Windows\\System32' : '/usr/bin';
    } catch {
        return process.platform === 'win32' ? 'C:\\Windows\\System32' : '/usr/bin';
    }
}

export function isolatedPath(binDir: string): string {
    const parts = [binDir, gitBinDir()];
    if (process.platform === 'win32') {
        const system32 = process.env.SystemRoot
            ? path.join(process.env.SystemRoot, 'System32')
            : 'C:\\Windows\\System32';
        parts.push(system32);
    } else {
        parts.push('/usr/bin', '/bin');
    }
    return [...new Set(parts)].join(path.delimiter);
}

export async function writeFakeBinaries(
    binDir: string,
    names: string[],
    body = process.platform === 'win32' ? '@echo off\r\nexit /b 0\r\n' : '#!/bin/sh\nexit 0\n',
): Promise<void> {
    await fs.mkdir(binDir, { recursive: true });
    for (const name of names) {
        const fileName = process.platform === 'win32' && !/\.(cmd|exe|bat)$/i.test(name)
            ? `${name}.cmd`
            : name;
        await fs.writeFile(path.join(binDir, fileName), body, { mode: 0o755 });
    }
}

export async function writeGlobalCommandModule(homeDir: string, tag: string): Promise<string> {
    const commandsDir = path.join(homeDir, '.lumpcode', 'commands');
    await fs.mkdir(commandsDir, { recursive: true });
    const filePath = path.join(commandsDir, `${tag}.js`);
    await fs.writeFile(filePath, 'export const command = () => null;\n', 'utf-8');
    return filePath;
}

export function isolateProcessEnv(input: { homeDir: string; pathValue: string }): () => void {
    const prev = {
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        PATH: process.env.PATH,
    };
    process.env.HOME = input.homeDir;
    process.env.USERPROFILE = input.homeDir;
    process.env.PATH = input.pathValue;
    return () => {
        if (prev.HOME === undefined) delete process.env.HOME;
        else process.env.HOME = prev.HOME;
        if (prev.USERPROFILE === undefined) delete process.env.USERPROFILE;
        else process.env.USERPROFILE = prev.USERPROFILE;
        if (prev.PATH === undefined) delete process.env.PATH;
        else process.env.PATH = prev.PATH;
    };
}

export async function setupSetupTestRepo(input: {
    tmpPrefix: string;
    branch?: string;
    readme?: boolean;
    mkdirLocalConfig?: boolean;
    agentBinaries?: string[];
}): Promise<SetupTestProject> {
    const dirs = await createTempTestDirs({
        prefix: `${input.tmpPrefix}-`,
        mkdirLocalConfig: input.mkdirLocalConfig ?? false,
    });
    const projectRoot = dirs.projectRoot;
    const remoteDir = dirs.remoteDir;
    const homeDir = dirs.globalConfigFolderPath;
    const globalConfigFolderPath = path.join(homeDir, '.lumpcode');
    await fs.mkdir(globalConfigFolderPath, { recursive: true });

    initBareRemoteAndCheckout({
        projectRoot,
        remoteDir,
        branch: input.branch ?? 'main',
    });

    if (input.readme !== false) {
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# setup test\n', 'utf-8');
    }

    const binDir = path.join(homeDir, 'bin');
    await writeFakeBinaries(binDir, input.agentBinaries ?? []);
    const restoreEnv = isolateProcessEnv({
        homeDir,
        pathValue: isolatedPath(binDir),
    });

    return { projectRoot, remoteDir, homeDir, globalConfigFolderPath, restoreEnv };
}

export async function teardownSetupTestRepo(project: SetupTestProject): Promise<void> {
    project.restoreEnv();
    await removeTempTestDirs({
        projectRoot: project.projectRoot,
        remoteDir: project.remoteDir,
        globalConfigFolderPath: project.homeDir,
    });
}

export async function writeExistingProjectFiles(input: {
    projectRoot: string;
    projectJson?: Record<string, unknown>;
    localJson?: Record<string, unknown>;
    lumpName?: string;
    lumpConfig?: Record<string, unknown> | string;
    lumpFormat?: 'json' | 'js' | 'ts';
}): Promise<void> {
    const lumpcodeDir = path.join(input.projectRoot, '.lumpcode');
    await fs.mkdir(path.join(lumpcodeDir, 'lumps'), { recursive: true });
    await fs.mkdir(path.join(lumpcodeDir, 'commands'), { recursive: true });
    await writeJsonFile({
        filePath: path.join(lumpcodeDir, 'project.json'),
        data: { projectName: 'existing-app', primaryBranch: 'main', ...input.projectJson },
        pretty: true,
        trailingNewline: true,
    });
    await writeJsonFile({
        filePath: path.join(lumpcodeDir, 'local.json'),
        data: { mode: 'shared', keepHistory: true, ...input.localJson },
        pretty: true,
        trailingNewline: true,
    });
    if (input.lumpName) {
        const lumpDir = path.join(lumpcodeDir, 'lumps', input.lumpName);
        await fs.mkdir(lumpDir, { recursive: true });
        const format = input.lumpFormat ?? 'json';
        const fileName = format === 'json' ? 'config.json' : format === 'ts' ? 'config.ts' : 'config.js';
        const body = input.lumpConfig
            ?? (format === 'json'
                ? {
                    contextListJson: { FILE: 'README.md' },
                    prompt: { promptTemplate: SETUP_PROMPT, command: 'my-agent' },
                }
                : `export default { contextMatchFn() { return null; }, prompt: { promptTemplate: '${SETUP_PROMPT}', command: 'my-agent' } };\n`);
        if (typeof body === 'string') {
            await fs.writeFile(path.join(lumpDir, fileName), body, 'utf-8');
        } else {
            await writeJsonFile({
                filePath: path.join(lumpDir, fileName),
                data: body,
                pretty: true,
                trailingNewline: true,
            });
        }
    }
}

export function scriptedPrompter(handlers: {
    confirm?: (input: { message: string; defaultValue: boolean }) => boolean | Promise<boolean>;
    select?: (input: {
        message: string;
        choices: { value: string; label: string }[];
    }) => string | Promise<string>;
    input?: (input: { message: string; defaultValue?: string }) => string | Promise<string>;
    pause?: (input: { message: string }) => void | Promise<void>;
}): ScriptedPrompter {
    const calls: PromptCall[] = [];
    return {
        calls,
        async confirm(input) {
            calls.push({ kind: 'confirm', ...input });
            if (handlers.confirm) return handlers.confirm(input);
            return input.defaultValue;
        },
        async select(input) {
            calls.push({ kind: 'select', ...input });
            if (handlers.select) return handlers.select(input);
            const first = input.choices[0]?.value;
            if (first === undefined) throw new Error(`select with no choices: ${input.message}`);
            return first;
        },
        async input(input) {
            calls.push({ kind: 'input', ...input });
            if (handlers.input) return handlers.input(input);
            return input.defaultValue ?? '';
        },
        async pause(input) {
            calls.push({ kind: 'pause', ...input });
            if (handlers.pause) await handlers.pause(input);
        },
    };
}

export function sharedJsonHappyPathPrompter(overrides: Parameters<typeof scriptedPrompter>[0] = {}) {
    return scriptedPrompter({
        confirm: (input) => {
            if (/skill/i.test(input.message)) return false;
            if (/wipe|reset|this checkout/i.test(input.message)) return false;
            if (/worker|daemon|leave/i.test(input.message)) return false;
            if (/run/i.test(input.message)) return true;
            return overrides.confirm?.(input) ?? input.defaultValue;
        },
        select: (input) => {
            if (/mode/i.test(input.message)) return 'shared';
            if (/strategy|checkout|worktree/i.test(input.message)) return 'checkout';
            if (/format|json|javascript|typescript|\bjs\b|\bts\b/i.test(input.message)) return 'json';
            if (/commit|push|git/i.test(input.message)) return 'cli';
            if (/command|agent|preset/i.test(input.message)) {
                return input.choices.find((c) => c.value === 'custom')?.value ?? input.choices[0]!.value;
            }
            return overrides.select?.(input) ?? input.choices[0]!.value;
        },
        input: (input) => {
            if (/command|tag|agent/i.test(input.message)) return 'my-agent';
            if (/lump/i.test(input.message)) return input.defaultValue ?? DEFAULT_LUMP_NAME;
            if (/file|path|readme/i.test(input.message)) return input.defaultValue ?? 'README.md';
            if (/suffix|extension/i.test(input.message)) return '.ts';
            return overrides.input?.(input) ?? input.defaultValue ?? '';
        },
        pause: overrides.pause,
    });
}

export function dedicatedHappyPathPrompter(overrides: Parameters<typeof scriptedPrompter>[0] = {}) {
    const base = sharedJsonHappyPathPrompter({
        ...overrides,
        confirm: (input) => {
            if (/wipe|reset|this checkout/i.test(input.message)) return true;
            if (/worker|daemon|leave/i.test(input.message)) return true;
            if (/skill/i.test(input.message)) return false;
            if (/run/i.test(input.message)) return true;
            return overrides.confirm?.(input) ?? input.defaultValue;
        },
        select: (input) => {
            if (/mode/i.test(input.message)) return 'dedicated';
            if (/strategy|checkout|worktree/i.test(input.message)) return 'checkout';
            if (/format|json|javascript|typescript|\bjs\b|\bts\b/i.test(input.message)) return 'json';
            if (/commit|push|git/i.test(input.message)) return 'cli';
            return overrides.select?.(input) ?? input.choices[0]!.value;
        },
    });
    return base;
}

export function makeSetupHandler(injections: Parameters<typeof command.handlerMaker>[0] = {}) {
    return command.handlerMaker({
        isInteractive: true,
        ...injections,
    });
}

export async function readJson(filePath: string): Promise<unknown> {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
}

export function lumpConfigPath(projectRoot: string, lumpName: string, format: 'json' | 'js' | 'ts') {
    const ext = format === 'json' ? 'json' : format;
    return path.join(projectRoot, '.lumpcode', 'lumps', lumpName, `config.${ext}`);
}
