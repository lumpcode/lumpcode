import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import * as z from 'zod';

import {
    execAsync,
    failure,
    getCodeBasePaths,
    nodeErrnoCode,
    pathExists,
    shellSingleQuote,
    success,
    type Failure,
    type Success,
} from '@lumpcode/core';

import { globalConfigFolderPath } from '../../constants';
import { DISCOVERY_GIT_TIMEOUT_MS } from '../../consts';
import { Command, CommandHandlerMaker } from '../../types';
import type { Mode } from '../../types/Mode';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { commandFailure } from '../../utils/commandFailure';
import { createCliLogger } from '../../utils/createCliLogger';
import { getCommandPath } from '../../utils/getCommandPath';
import { isValidProjectName, resolveInferredProjectName } from '../../utils/getProjectName';
import { installRunAbortHandlers } from '../../utils/installRunAbortHandlers';
import { assertValidLumpName } from '../../utils/isValidLumpName';
import { listRemoteHeadBranches } from '../../utils/listRemoteHeadBranches';
import { localConfigFolderPath } from '../../utils/localConfigFolderPath';
import { lumpDirPath } from '../../utils/lumpDirPath';
import { planLumpFromJsConfig } from '../../utils/planLumpFromJsConfig';
import { runLumpFromJsConfigFailureMessage } from '../../utils/runLumpFromJsConfig';
import { runLumpFromLumpName } from '../../utils/runLumpFromLumpName';
import { scaffoldLumpcodeProject } from '../../utils/scaffoldLumpcodeProject';
import { writeJsonFile } from '../../utils/writeJsonFile';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        projectPath: z.string().optional().describe('Path to the project root directory'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: { projectRoot: string; lumpName?: string; branchName?: string };
};

export type SetupPrompter = {
    confirm(input: { message: string; defaultValue: boolean }): Promise<boolean>;
    select(input: { message: string; choices: { value: string; label: string }[] }): Promise<string>;
    input(input: { message: string; defaultValue?: string }): Promise<string>;
    pause(input: { message: string }): Promise<void>;
};

export interface Injections {
    isInteractive?: () => boolean;
    prompter?: SetupPrompter;
}

const WORKER_URL = 'https://www.lumpcode.com/docs/start/worker';
const AGENTS_DOCS_URL = 'https://www.lumpcode.com/docs/author/agents';
const DEFAULT_LUMP_NAME = 'myFirstLump';
const PROMPT_TEMPLATE = 'clean and improve the code in @{FILE}';
const CONTEXT_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const CONFIG_FILE_NAMES = ['config.json', 'config.js', 'config.ts'] as const;
const CUSTOM_COMMAND_VALUE = 'custom';
const SKILL_INSTALL_TIMEOUT_MS = 3_000;
const COMMIT_ALLOWLIST = [
    '.gitignore',
    '.lumpcode/project.json',
    '.lumpcode/lumps/',
    '.lumpcode/commands/',
    'package.json',
    'package-lock.json',
] as const;
const AGENT_PRESETS = [
    { bin: 'cursor-agent', tag: 'cursor', label: 'Cursor' },
    { bin: 'copilot', tag: 'copilot', label: 'GitHub Copilot' },
    { bin: 'claude', tag: 'claude-code', label: 'Claude Code' },
    { bin: 'opencode', tag: 'opencode', label: 'OpenCode' },
    { bin: 'codex', tag: 'codex', label: 'Codex' },
] as const;

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections = {}) => async (input) => {
    const isInteractive = injections.isInteractive ?? (() => process.stdin.isTTY === true);
    const prompter = injections.prompter ?? createDefaultPrompter();

    if (input.options.json) {
        return commandFailure('setup is interactive and does not support --json. Use project-setup for non-interactive init.');
    }
    if (!isInteractive()) {
        return commandFailure(
            'setup requires an interactive terminal. Use lumpcode project-setup for non-interactive init.',
        );
    }

    const messages: string[] = [];
    const logger = createCliLogger({ verbose: !!input.options.verbose });
    const note = (line: string) => {
        messages.push(line);
        console.log(line);
    };

    const resolvedRoot = await resolveProjectRoot(input.options.projectPath);
    if (!resolvedRoot.success) return commandFailure(resolvedRoot.data);
    const projectRoot = resolvedRoot.data;

    const preflight = await runPreflight(projectRoot);
    if (!preflight.success) return commandFailure(preflight.data);
    const agentsOnPath = preflight.data;

    const lumpcodeDir = localConfigFolderPath({ projectRoot });
    const lumpcodeExists = await pathExists(lumpcodeDir);

    const installSkill = await prompter.confirm({
        message: 'Install the Lumpcode agent skill (npx skills add lumpcode/skills)?',
        defaultValue: true,
    });
    if (installSkill) {
        const skillResult = await execAsync('npx skills add lumpcode/skills', {
            cwd: projectRoot,
            timeoutMillis: SKILL_INSTALL_TIMEOUT_MS,
        });
        if (!skillResult.success) {
            const warn = `Skill install failed; you can run \`npx skills add lumpcode/skills\` later. ${skillResult.data.message}`;
            messages.push(warn);
            logger.warn(warn);
        }
    }

    if (lumpcodeExists) {
        return failure({
            messages: [`This repo is already initialized with Lumpcode at ${lumpcodeDir}.`],
        });
    }

    const localConfigResult = await promptLocalConfig({ projectRoot, prompter });
    if (!localConfigResult.success) return commandFailure(localConfigResult.data);
    const { projectName, primaryBranch, mode, workspaceStrategy, maxParallelRun } = localConfigResult.data;

    const scaffoldResult = await scaffoldLumpcodeProject({
        projectRoot,
        project: { projectName, primaryBranch },
        local: {
            mode,
            ...(workspaceStrategy !== undefined ? { workspaceStrategy } : {}),
            ...(maxParallelRun !== undefined ? { maxParallelRun } : {}),
        },
    });
    if (!scaffoldResult.success) return commandFailure(scaffoldResult.data);

    const commandPaths = { localConfigFolderPath: lumpcodeDir, globalConfigFolderPath };
    const commandTag = await chooseCommand({ agentsOnPath, prompter, commandPaths, note });
    if (!commandTag.success) return commandFailure(commandTag.data);

    const lumpNameResult = await promptLumpName({ lumpcodeDir, prompter });
    if (!lumpNameResult.success) return commandFailure(lumpNameResult.data);
    const lumpName = lumpNameResult.data;

    const fileResult = await promptContextFile({ projectRoot, prompter });
    if (!fileResult.success) return commandFailure(fileResult.data);
    const { fileRel, contextName } = fileResult.data;

    const lumpDir = lumpDirPath({ localConfigFolderPath: lumpcodeDir, lumpName });
    const configPath = path.join(lumpDir, 'config.json');
    const writeResult = await writeJsonFile({
        filePath: configPath,
        data: {
            contextListJson: [{ name: contextName, variables: { FILE: fileRel } }],
            prompt: { promptTemplate: PROMPT_TEMPLATE, command: commandTag.data },
        },
        pretty: true,
        trailingNewline: true,
        mkdir: true,
    });
    if (!writeResult.success) return commandFailure(writeResult.data);

    const relConfigPath = toPosix(path.relative(projectRoot, configPath));
    note(`First lump config: ${relConfigPath}`);
    await prompter.pause({ message: 'Edit the lump config if you want, then press Enter' });

    const commitResult = await commitPush({ projectRoot, lumpName, prompter, note });
    if (!commitResult.success) return commandFailure(commitResult.data);

    const runResult = await planAndRun({
        projectRoot,
        lumpcodeDir,
        lumpName,
        mode,
        relConfigPath,
        prompter,
        note,
        logger,
    });
    if (!runResult.success) return runResult;
    return success({ messages, data: runResult.data });
};

export const command = {
    handlerMaker,
    name: 'setup',
    description: 'Interactive first-run drive: scaffold, first lump, plan, and run',
    inputSchema,
} satisfies Command;

function createDefaultPrompter(): SetupPrompter {
    async function question(prompt: string): Promise<string> {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        try {
            return await rl.question(prompt);
        } finally {
            rl.close();
        }
    }
    return {
        async confirm({ message, defaultValue }) {
            const hint = defaultValue ? 'Y/n' : 'y/N';
            const raw = (await question(`${message} (${hint}) `)).trim().toLowerCase();
            if (raw === '') return defaultValue;
            if (raw === 'y' || raw === 'yes') return true;
            if (raw === 'n' || raw === 'no') return false;
            return defaultValue;
        },
        async select({ message, choices }) {
            const body = [message, ...choices.map((choice, index) => `  ${index + 1}. ${choice.label}`)].join('\n');
            const raw = (await question(`${body}\n[1] `)).trim();
            if (raw === '') return choices[0]!.value;
            const asNum = Number(raw);
            if (Number.isInteger(asNum) && asNum >= 1 && asNum <= choices.length) {
                return choices[asNum - 1]!.value;
            }
            const match = choices.find((choice) => choice.value === raw || choice.label === raw);
            return match?.value ?? choices[0]!.value;
        },
        async input({ message, defaultValue }) {
            const hint = defaultValue ? ` (${defaultValue})` : '';
            const raw = (await question(`${message}${hint} `)).trim();
            return raw === '' ? (defaultValue ?? '') : raw;
        },
        async pause({ message }) {
            await question(`${message} `);
        },
    };
}

async function resolveProjectRoot(
    projectPathOpt: string | undefined,
): Promise<Success<string> | Failure<string>> {
    const startDir = path.resolve(process.cwd(), projectPathOpt?.trim() ? projectPathOpt.trim() : '.');
    try {
        const stat = await fs.stat(startDir);
        if (!stat.isDirectory()) {
            return failure(`Project path is not a directory: ${startDir}`);
        }
    } catch (error: unknown) {
        if (nodeErrnoCode(error) === 'ENOENT') {
            return failure(`Project path does not exist: ${startDir}`);
        }
        return failure(`Cannot read project path ${startDir}: ${String(error)}`);
    }
    const top = await execAsync('git rev-parse --show-toplevel', { cwd: startDir });
    if (!top.success || top.data.stdout.trim() === '') {
        return failure(`Not a git repository (expected a working tree at ${startDir})`);
    }
    return success(top.data.stdout.trim());
}

async function runPreflight(projectRoot: string): Promise<Success<string[]> | Failure<string>> {
    const origin = await execAsync('git remote get-url origin', { cwd: projectRoot });
    if (!origin.success || origin.data.stdout.trim() === '') {
        return failure('No git remote named origin. Add origin, then re-run setup.');
    }
    const reachable = await execAsync('git ls-remote --heads origin', {
        cwd: projectRoot,
        timeoutMillis: DISCOVERY_GIT_TIMEOUT_MS,
    });
    if (!reachable.success) {
        return failure(`origin is not reachable: ${reachable.data.message}`);
    }
    const userName = await execAsync('git config user.name', { cwd: projectRoot });
    const userEmail = await execAsync('git config user.email', { cwd: projectRoot });
    if (!userName.success || !userName.data.stdout.trim() || !userEmail.success || !userEmail.data.stdout.trim()) {
        return failure('git user.name and user.email must be set for setup to commit.');
    }
    return success(detectAgentsOnPath());
}

function detectAgentsOnPath(): string[] {
    return AGENT_PRESETS.filter((agent) => binaryOnPath(agent.bin)).map((agent) => agent.tag);
}

function binaryOnPath(bin: string): boolean {
    const pathEnv = process.env.PATH ?? '';
    const exts = process.platform === 'win32' ? ['', '.cmd', '.exe', '.bat'] : [''];
    for (const dir of pathEnv.split(path.delimiter)) {
        if (!dir) continue;
        for (const ext of exts) {
            if (existsSync(path.join(dir, bin + ext))) return true;
        }
    }
    return false;
}

async function promptLocalConfig(input: {
    projectRoot: string;
    prompter: SetupPrompter;
}): Promise<
    | Success<{
          projectName: string;
          primaryBranch: string;
          mode: Mode;
          workspaceStrategy?: WorkspaceStrategy;
          maxParallelRun?: number;
      }>
    | Failure<string>
> {
    const { projectRoot, prompter } = input;
    const inferredName = await resolveInferredProjectName({ projectRoot });
    if (!inferredName.success) return inferredName;
    let projectName = inferredName.data;
    const useName = await prompter.confirm({
        message: `Use project name "${projectName}"?`,
        defaultValue: true,
    });
    if (!useName) {
        while (true) {
            const typed = (await prompter.input({ message: 'Project name' })).trim();
            if (isValidProjectName(typed)) {
                projectName = typed;
                break;
            }
        }
    }

    let primaryBranch = await inferPrimaryBranch(projectRoot);
    if (primaryBranch) {
        const useBranch = await prompter.confirm({
            message: `Use primary branch "${primaryBranch}"?`,
            defaultValue: true,
        });
        if (!useBranch) {
            const typed = (await prompter.input({ message: 'Primary branch', defaultValue: primaryBranch })).trim();
            if (typed) primaryBranch = typed;
        }
    } else {
        primaryBranch = (await prompter.input({ message: 'Primary branch' })).trim();
        if (!primaryBranch) {
            return failure('A primary branch is required.');
        }
    }
    const onOrigin = await remoteHasBranch(projectRoot, primaryBranch);
    if (!onOrigin) {
        return failure(`Branch "${primaryBranch}" is not on origin. Create it on the remote, then re-run setup.`);
    }

    const mode = (await prompter.select({
        message: 'Which mode should this machine use?',
        choices: [
            { value: 'shared', label: 'shared (rehearse on this branch)' },
            { value: 'dedicated', label: 'dedicated (worker checkout; run resets it)' },
        ],
    })) as Mode;

    let workspaceStrategy: WorkspaceStrategy | undefined;
    let maxParallelRun: number | undefined;
    if (mode === 'dedicated') {
        workspaceStrategy = (await prompter.select({
            message: 'Workspace strategy',
            choices: [
                { value: 'checkout', label: 'checkout (default)' },
                { value: 'worktree', label: 'worktree' },
            ],
        })) as WorkspaceStrategy;
        if (workspaceStrategy === 'checkout') {
            workspaceStrategy = undefined;
        }
        if (workspaceStrategy === 'worktree') {
            const raw = (await prompter.input({ message: 'maxParallelRun', defaultValue: '1' })).trim();
            const parsed = Number(raw);
            if (Number.isInteger(parsed) && parsed > 1) {
                maxParallelRun = parsed;
            }
        }
        const wipeOk = await prompter.confirm({
            message: 'Dedicated mode: lumpcode run resets this checkout. Continue?',
            defaultValue: true,
        });
        if (!wipeOk) {
            return failure('Dedicated run resets this checkout. Aborting setup.');
        }
    }

    return success({ projectName, primaryBranch, mode, workspaceStrategy, maxParallelRun });
}

async function inferPrimaryBranch(projectRoot: string): Promise<string> {
    const originHead = await execAsync('git rev-parse --abbrev-ref origin/HEAD', { cwd: projectRoot });
    if (originHead.success) {
        const ref = originHead.data.stdout.trim();
        if (ref.startsWith('origin/') && ref !== 'origin/HEAD') {
            return ref.slice('origin/'.length);
        }
    }
    const current = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot });
    if (current.success) {
        const branch = current.data.stdout.trim();
        if (branch && branch !== 'HEAD') return branch;
    }
    return '';
}

async function remoteHasBranch(projectRoot: string, branch: string): Promise<boolean> {
    const listed = await listRemoteHeadBranches({
        cwd: projectRoot,
        branchGlob: branch,
        timeoutMillis: DISCOVERY_GIT_TIMEOUT_MS,
    });
    return listed.success && listed.data.includes(branch);
}

async function chooseCommand(input: {
    agentsOnPath: string[];
    prompter: SetupPrompter;
    commandPaths: { localConfigFolderPath: string; globalConfigFolderPath: string };
    note: (line: string) => void;
}): Promise<Success<string> | Failure<string>> {
    const { agentsOnPath, prompter, commandPaths, note } = input;
    if (agentsOnPath.length === 0) {
        note(AGENTS_DOCS_URL);
        return waitForCustomCommandTag({ prompter, commandPaths });
    }
    if (agentsOnPath.length === 1) {
        const tag = agentsOnPath[0]!;
        const useIt = await prompter.confirm({
            message: `Use the ${tag} command for the first lump?`,
            defaultValue: true,
        });
        if (useIt) return success(tag);
        return waitForCustomCommandTag({ prompter, commandPaths });
    }
    const selected = await prompter.select({
        message: 'Which command/agent should the first lump use?',
        choices: [
            ...agentsOnPath.map((tag) => {
                const preset = AGENT_PRESETS.find((agent) => agent.tag === tag);
                return { value: tag, label: preset ? `${preset.label} (${tag})` : tag };
            }),
            { value: CUSTOM_COMMAND_VALUE, label: 'Custom command tag' },
        ],
    });
    if (selected === CUSTOM_COMMAND_VALUE) {
        return waitForCustomCommandTag({ prompter, commandPaths });
    }
    return success(selected);
}

async function waitForCustomCommandTag(input: {
    prompter: SetupPrompter;
    commandPaths: { localConfigFolderPath: string; globalConfigFolderPath: string };
}): Promise<Success<string> | Failure<string>> {
    while (true) {
        const tag = (await input.prompter.input({ message: 'Command tag (agent module name)' })).trim();
        if (!tag) continue;
        if (await commandTagResolves(tag, input.commandPaths)) return success(tag);
    }
}

async function commandTagResolves(
    tag: string,
    commandPaths: { localConfigFolderPath: string; globalConfigFolderPath: string },
): Promise<boolean> {
    const resolved = await getCommandPath(tag, commandPaths);
    return Boolean(resolved && (await pathExists(resolved)));
}

async function promptLumpName(input: {
    lumpcodeDir: string;
    prompter: SetupPrompter;
}): Promise<Success<string> | Failure<string>> {
    while (true) {
        const lumpName = (
            await input.prompter.input({ message: 'Lump name', defaultValue: DEFAULT_LUMP_NAME })
        ).trim() || DEFAULT_LUMP_NAME;
        const nameCheck = assertValidLumpName(lumpName);
        if (!nameCheck.ok) continue;
        const lumpDir = lumpDirPath({ localConfigFolderPath: input.lumpcodeDir, lumpName });
        if (await lumpDirHasAnyConfigFile(lumpDir)) continue;
        return success(lumpName);
    }
}

async function lumpDirHasAnyConfigFile(lumpDir: string): Promise<boolean> {
    for (const name of CONFIG_FILE_NAMES) {
        if (await pathExists(path.join(lumpDir, name))) return true;
    }
    return false;
}

async function promptContextFile(input: {
    projectRoot: string;
    prompter: SetupPrompter;
}): Promise<Success<{ fileRel: string; contextName: string }> | Failure<string>> {
    const readmeRel = 'README.md';
    if (await pathExists(path.join(input.projectRoot, readmeRel))) {
        const contextName = contextNameFromRelPath(readmeRel);
        if (contextName) return success({ fileRel: readmeRel, contextName });
    }
    const scanned = await getCodeBasePaths({ cwd: input.projectRoot });
    const fallback = scanned.success
        ? scanned.data.find((entry) => !entry.isDir && contextNameFromRelPath(toPosix(entry.path)))
        : undefined;
    const fallbackRel = fallback ? toPosix(fallback.path) : undefined;
    while (true) {
        const typed = toPosix(
            (await input.prompter.input({ message: 'Path to an existing file', defaultValue: fallbackRel })).trim(),
        );
        if (!typed) continue;
        if (!(await pathExists(path.join(input.projectRoot, typed)))) continue;
        const contextName = contextNameFromRelPath(typed);
        if (!contextName) continue;
        return success({ fileRel: typed, contextName });
    }
}

function contextNameFromRelPath(relPath: string): string | undefined {
    const stripped = path.basename(relPath).replace(/\.[^/.]+$/, '');
    return CONTEXT_NAME_RE.test(stripped) ? stripped : undefined;
}

function toPosix(relPath: string): string {
    return relPath.split(path.sep).join('/');
}

async function commitPush(input: {
    projectRoot: string;
    lumpName: string;
    prompter: SetupPrompter;
    note: (line: string) => void;
}): Promise<Success<void> | Failure<string>> {
    const existing: string[] = [];
    for (const rel of COMMIT_ALLOWLIST) {
        if (await pathExists(path.join(input.projectRoot, rel))) existing.push(rel);
    }
    const subject = `Add Lumpcode setup and ${input.lumpName}`;
    const addCmd = existing.length > 0
        ? `git add -- ${existing.map((rel) => shellSingleQuote(rel)).join(' ')}`
        : undefined;
    const commitCmd = `git commit -m ${shellSingleQuote(subject)}`;
    const pushCmd = 'git push -u origin HEAD';
    const choice = await input.prompter.select({
        message: 'Commit and push setup files',
        choices: [
            { value: 'cli', label: 'Let the CLI commit and push' },
            { value: 'manual', label: 'I will run the git commands' },
        ],
    });
    if (choice === 'manual') {
        if (addCmd) input.note(addCmd);
        input.note(commitCmd);
        input.note(pushCmd);
        await input.prompter.pause({ message: 'Run those git commands, then press Enter' });
        return success(undefined);
    }
    if (addCmd) {
        const addResult = await execAsync(addCmd, { cwd: input.projectRoot });
        if (!addResult.success) return failure(`Failed to git add setup files: ${addResult.data.message}`);
    }
    const commitResult = await execAsync(commitCmd, { cwd: input.projectRoot });
    if (!commitResult.success && !isNothingToCommit(commitResult.data.message)) {
        return failure(`Failed to commit setup files: ${commitResult.data.message}`);
    }
    const pushResult = await execAsync(pushCmd, { cwd: input.projectRoot });
    if (!pushResult.success) return failure(`Failed to push setup files: ${pushResult.data.message}`);
    return success(undefined);
}

function isNothingToCommit(message: string): boolean {
    return /nothing to commit/i.test(message);
}

async function planAndRun(input: {
    projectRoot: string;
    lumpcodeDir: string;
    lumpName: string;
    mode: Mode;
    relConfigPath: string;
    prompter: SetupPrompter;
    note: (line: string) => void;
    logger: ReturnType<typeof createCliLogger>;
}): Promise<Success<{ projectRoot: string; lumpName: string; branchName?: string }> | Failure<Output>> {
    while (true) {
        const plan = await planLumpFromJsConfig({
            lumpName: input.lumpName,
            localConfigFolderPath: input.lumpcodeDir,
            globalConfigFolderPath,
            projectRoot: input.projectRoot,
            depth: 'contexts',
        });
        if (!plan.success) return commandFailure(plan.data);
        const contexts = plan.data.contexts ?? [];
        if (contexts.length === 0) {
            input.note('Plan has no contexts. Edit the lump config and try again.');
            await input.prompter.pause({
                message: `Edit ${input.relConfigPath}, then press Enter`,
            });
            continue;
        }
        input.note(`Contexts: ${contexts.map((context) => context.name).join(', ')}`);
        const shouldRun = await input.prompter.confirm({
            message: 'Run the lump now? This invokes your coding agent (LLM cost).',
            defaultValue: true,
        });
        if (!shouldRun) {
            input.note(WORKER_URL);
            return success({ projectRoot: input.projectRoot, lumpName: input.lumpName });
        }
        break;
    }

    const abortController = new AbortController();
    const disposeAbortHandlers = installRunAbortHandlers({ abortController, logger: input.logger });
    try {
        const runLumpRes = await runLumpFromLumpName({
            lumpName: input.lumpName,
            localConfigFolderPath: input.lumpcodeDir,
            globalConfigFolderPath,
            sourceProjectRoot: input.projectRoot,
            logger: input.logger,
            signal: abortController.signal,
        });
        if (!runLumpRes.success) {
            return commandFailure(runLumpFromJsConfigFailureMessage(runLumpRes.data));
        }
        if (runLumpRes.data.skipped) {
            input.note(runLumpRes.data.reasonDetail ?? runLumpRes.data.reason);
            input.note(WORKER_URL);
            return success({ projectRoot: input.projectRoot, lumpName: input.lumpName });
        }
        let branchName: string | undefined;
        if (input.mode === 'shared') {
            const head = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: input.projectRoot });
            branchName = head.success ? head.data.stdout.trim() : undefined;
            if (branchName) input.note(`Ran on branch ${branchName}.`);
        } else {
            branchName = runLumpRes.data.result.branchName;
            if (branchName) input.note(`Pushed ${branchName}.`);
        }
        input.note(WORKER_URL);
        return success({ projectRoot: input.projectRoot, lumpName: input.lumpName, branchName });
    } finally {
        disposeAbortHandlers();
    }
}
