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
import { DEFAULT_DAEMON_CRON_SETUP, DISCOVERY_GIT_TIMEOUT_MS } from '../../consts';
import { Command, CommandHandlerMaker } from '../../types';
import type { Mode } from '../../types/Mode';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { commandFailure } from '../../utils/commandFailure';
import { createCliLogger } from '../../utils/createCliLogger';
import { RESERVED_DAEMON_ID } from '../../utils/daemonFileBaseName';
import { discoverLumpNames } from '../../utils/discoverLoadableLumpNames';
import { getCommandPath } from '../../utils/getCommandPath';
import { getProjectName, isValidProjectName, resolveInferredProjectName } from '../../utils/getProjectName';
import { installRunAbortHandlers } from '../../utils/installRunAbortHandlers';
import { assertValidLumpName } from '../../utils/isValidLumpName';
import { launchStartDaemon } from '../../utils/launchStartDaemon';
import { listRemoteHeadBranches } from '../../utils/listRemoteHeadBranches';
import { localConfigFolderPath } from '../../utils/localConfigFolderPath';
import { lumpDirPath } from '../../utils/lumpDirPath';
import { planLumpFromJsConfig } from '../../utils/planLumpFromJsConfig';
import { readJsonFile } from '../../utils/readJsonFile';
import { LOCAL_CONFIG_FILE_NAME, readLocalConfig } from '../../utils/readLocalConfig';
import { readProjectJson } from '../../utils/readProjectJson';
import { readProjectLocalConfig } from '../../utils/readProjectLocalConfig';
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
    data?: { projectRoot: string; lumpName?: string; branchName?: string; startedDaemon?: boolean };
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
const WORKER_NEXT_STEP = 'Next: leave a worker running on a clone you never edit.';
const AGENTS_DOCS_URL = 'https://www.lumpcode.com/docs/author/agents';
const DEFAULT_LUMP_NAME = 'myFirstLump';
const PROMPT_TEMPLATE = 'clean and improve the code in @{FILE}';
const CONTEXT_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const CONFIG_FILE_NAMES = ['config.json', 'config.js', 'config.ts'] as const;
type ConfigFormat = 'json' | 'js' | 'ts';
const DEFAULT_MATCH_SUFFIX = '.js';
const AUTHORING_PACKAGES_INSTALL = 'npm install @lumpcode/cli-utils @lumpcode/recipes';
const CUSTOM_COMMAND_VALUE = 'custom';
const SKILL_INSTALL_COMMAND = 'npx skills add lumpcode/skills -y';
const SKILL_INSTALL_TIMEOUT_MS = 60_000;
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
    let printedLive = false;
    const note = (line: string) => {
        messages.push(line);
        console.log(line);
        printedLive = true;
    };

    const resolvedRoot = await resolveProjectRoot(input.options.projectPath);
    if (!resolvedRoot.success) return commandFailure(resolvedRoot.data);
    const projectRoot = resolvedRoot.data;

    const lumpcodeDir = localConfigFolderPath({ projectRoot });
    const lumpcodeExists = await pathExists(lumpcodeDir);

    let mode: Mode;
    let lumpName!: string;
    let relConfigPath!: string;
    let skipStub = false;
    let projectName!: string;
    let existingLocalMode: Mode | undefined;
    let existingLump: Awaited<ReturnType<typeof findExistingLumpConfig>> = undefined;

    if (lumpcodeExists) {
        const projectResult = await readProjectJson({ localConfigFolderPath: lumpcodeDir });
        if (!projectResult.success) return commandFailure(projectResult.data);
        projectName = projectResult.data.projectName;
        existingLump = await findExistingLumpConfig(lumpcodeDir);
        const localResult = await readLocalConfig({ localConfigFolderPath: lumpcodeDir });
        if (localResult.success && existingLump) {
            messages.push('Already set up: .lumpcode/local.json and a lump are present. Nothing to do.');
            return success({ messages, data: { projectRoot, lumpName: existingLump.lumpName } });
        }
        if (localResult.success) existingLocalMode = localResult.data.mode;
    }

    const preflight = await runPreflight(projectRoot);
    if (!preflight.success) return commandFailure(preflight.data);
    const agentsOnPath = preflight.data;

    const installSkill = await prompter.confirm({
        message: 'Install the Lumpcode agent skill (npx skills add lumpcode/skills)?',
        defaultValue: true,
    });
    if (installSkill) {
        const skillResult = await execAsync(SKILL_INSTALL_COMMAND, {
            cwd: projectRoot,
            timeoutMillis: SKILL_INSTALL_TIMEOUT_MS,
        });
        if (!skillResult.success) {
            const warn = `Skill install failed; you can run \`npx skills add lumpcode/skills -y\` later. ${skillResult.data.message}`;
            messages.push(warn);
            logger.warn(warn);
        }
    }

    if (lumpcodeExists) {
        if (existingLocalMode) {
            mode = existingLocalMode;
        } else {
            const existingLocalRead = await readJsonFile<unknown>({
                filePath: path.join(lumpcodeDir, LOCAL_CONFIG_FILE_NAME),
                ifMissing: 'undefined',
            });
            if (!existingLocalRead.success) return commandFailure(existingLocalRead.data);
            const existingLocal = recordFromUnknown(existingLocalRead.data);
            const currentMode =
                existingLocal.mode === 'shared' || existingLocal.mode === 'dedicated'
                    ? existingLocal.mode
                    : undefined;

            const machine = await promptModeAndDedicated({ prompter, currentMode });
            if (!machine.success) return commandFailure(machine.data);
            mode = machine.data.mode;

            const writeLocal = await writeMergedLocalJson({
                lumpcodeDir,
                existing: existingLocal,
                ...machine.data,
            });
            if (!writeLocal.success) return commandFailure(writeLocal.data);
        }

        if (existingLump) {
            skipStub = true;
            lumpName = existingLump.lumpName;
            relConfigPath = toPosix(path.relative(projectRoot, existingLump.configPath));
        }
    } else {
        const localConfigResult = await promptLocalConfig({ projectRoot, prompter });
        if (!localConfigResult.success) return commandFailure(localConfigResult.data);
        const { primaryBranch, workspaceStrategy, maxParallelRun } = localConfigResult.data;
        projectName = localConfigResult.data.projectName;
        mode = localConfigResult.data.mode;

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
    }

    if (!skipStub) {
        const commandPaths = { localConfigFolderPath: lumpcodeDir, globalConfigFolderPath };
        const configFormat = await chooseConfigFormat(prompter);
        if (configFormat !== 'json') {
            await maybeInstallAuthoringPackages({
                projectRoot,
                projectName,
                prompter,
                logger,
                messages,
            });
        }

        const commandTag = await chooseCommand({ agentsOnPath, prompter, commandPaths, note });
        if (!commandTag.success) return commandFailure(commandTag.data);

        const lumpNameResult = await promptLumpName({ lumpcodeDir, prompter });
        if (!lumpNameResult.success) return commandFailure(lumpNameResult.data);
        lumpName = lumpNameResult.data;

        const lumpDir = lumpDirPath({ localConfigFolderPath: lumpcodeDir, lumpName });
        let configPath: string;
        if (configFormat === 'json') {
            const fileResult = await promptContextFile({ projectRoot, prompter });
            if (!fileResult.success) return commandFailure(fileResult.data);
            const { fileRel, contextName } = fileResult.data;
            configPath = path.join(lumpDir, 'config.json');
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
        } else {
            const suffix = await resolveMatchSuffix({ projectRoot, prompter, format: configFormat });
            configPath = path.join(lumpDir, `config.${configFormat}`);
            const writeResult = await writeJsTsStub({
                configPath,
                suffix,
                commandTag: commandTag.data,
            });
            if (!writeResult.success) return commandFailure(writeResult.data);
        }

        relConfigPath = toPosix(path.relative(projectRoot, configPath));
        note(`First lump config: ${relConfigPath}`);
    }

    if (skipStub) {
        noteWorkerNextStep(note);
        const startResult = await maybeStartDedicatedDaemon({
            mode,
            projectRoot,
            lumpcodeDir,
            prompter,
            note,
            logger,
            verbose: !!input.options.verbose,
        });
        if (!startResult.success) return startResult;
        return success({ messages, data: { projectRoot, lumpName, ...startResult.data }, printed: printedLive });
    }

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

    const startResult = await maybeStartDedicatedDaemon({
        mode,
        projectRoot,
        lumpcodeDir,
        prompter,
        note,
        logger,
        verbose: !!input.options.verbose,
    });
    if (!startResult.success) return startResult;
    return success({ messages, data: { ...runResult.data, ...startResult.data }, printed: printedLive });
};

export const command = {
    handlerMaker,
    name: 'setup',
    description: 'Interactive first-run drive: scaffold or resume holes; no-op when local.json and a lump exist',
    inputSchema,
} satisfies Command;

function noteWorkerNextStep(note: (line: string) => void): void {
    note('');
    note(WORKER_NEXT_STEP);
    note(WORKER_URL);
    note('');
}

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
    const gitRoot = top.data.stdout.trim();
    try {
        if ((await fs.realpath(startDir)) === (await fs.realpath(gitRoot))) {
            return success(startDir);
        }
    } catch {
        // Prefer git's path when either side cannot be resolved.
    }
    return success(gitRoot);
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

    const machine = await promptModeAndDedicated({ prompter });
    if (!machine.success) return machine;

    return success({ projectName, primaryBranch, ...machine.data });
}

async function promptModeAndDedicated(input: {
    prompter: SetupPrompter;
    currentMode?: Mode;
}): Promise<
    | Success<{ mode: Mode; workspaceStrategy?: WorkspaceStrategy; maxParallelRun?: number }>
    | Failure<string>
> {
    const { prompter, currentMode } = input;
    const sharedChoice = { value: 'shared', label: 'shared (rehearse on this branch)' };
    const dedicatedChoice = { value: 'dedicated', label: 'dedicated (worker checkout; run resets it)' };
    const mode = (await prompter.select({
        message: 'Which mode should this machine use?',
        choices: currentMode === 'dedicated' ? [dedicatedChoice, sharedChoice] : [sharedChoice, dedicatedChoice],
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

    return success({ mode, workspaceStrategy, maxParallelRun });
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

async function chooseConfigFormat(prompter: SetupPrompter): Promise<ConfigFormat> {
    const selected = await prompter.select({
        message: 'First lump config format',
        choices: [
            { value: 'json', label: 'JSON' },
            { value: 'js', label: 'JavaScript' },
            { value: 'ts', label: 'TypeScript' },
        ],
    });
    if (selected === 'js' || selected === 'ts') return selected;
    return 'json';
}

async function maybeInstallAuthoringPackages(input: {
    projectRoot: string;
    projectName: string;
    prompter: SetupPrompter;
    logger: ReturnType<typeof createCliLogger>;
    messages: string[];
}): Promise<void> {
    const shouldInstall = await input.prompter.confirm({
        message: 'Install @lumpcode/cli-utils and @lumpcode/recipes?',
        defaultValue: true,
    });
    if (!shouldInstall) return;

    const warnAndContinue = (line: string) => {
        input.messages.push(line);
        input.logger.warn(line);
    };

    const pkgPath = path.join(input.projectRoot, 'package.json');
    if (!(await pathExists(pkgPath))) {
        const wrote = await writeJsonFile({
            filePath: pkgPath,
            data: { name: input.projectName, private: true },
            pretty: true,
            trailingNewline: true,
        });
        if (!wrote.success) {
            warnAndContinue(
                `Could not write package.json; you can run \`${AUTHORING_PACKAGES_INSTALL}\` later. ${wrote.data}`,
            );
            return;
        }
    }

    const installResult = await execAsync(AUTHORING_PACKAGES_INSTALL, { cwd: input.projectRoot });
    if (!installResult.success) {
        warnAndContinue(
            `Authoring package install failed; you can run \`${AUTHORING_PACKAGES_INSTALL}\` later. ${installResult.data.message}`,
        );
    }
}

async function resolveMatchSuffix(input: {
    projectRoot: string;
    prompter: SetupPrompter;
    format: 'js' | 'ts';
}): Promise<string> {
    const defaultSuffix = input.format === 'ts' ? '.ts' : DEFAULT_MATCH_SUFFIX;
    const scanned = await getCodeBasePaths({ cwd: input.projectRoot });
    const hasDefault = scanned.success
        && scanned.data.some(
            (entry) =>
                !entry.isDir
                && !pathHasNodeModules(toPosix(entry.path))
                && toPosix(entry.path).endsWith(defaultSuffix),
        );
    if (hasDefault) return defaultSuffix;
    while (true) {
        const example = defaultSuffix === '.ts' ? '.js' : '.ts';
        const typed = (
            await input.prompter.input({
                message: `No ${defaultSuffix} files found. File suffix to match (e.g. ${example})`,
            })
        ).trim();
        if (!typed) continue;
        return typed.startsWith('.') ? typed : `.${typed}`;
    }
}

function pathHasNodeModules(relPath: string): boolean {
    return relPath.split('/').includes('node_modules');
}

function contextMatchFnStubSource(input: { suffix: string; commandTag: string }): string {
    const suffixLit = JSON.stringify(input.suffix);
    const commandLit = JSON.stringify(input.commandTag);
    const promptLit = JSON.stringify(PROMPT_TEMPLATE);
    return `function contextNameFromPath(filePath) {
  return filePath.replace(/\\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function pathHasNodeModules(filePath) {
  return filePath.split(/[\\\\/]/).includes('node_modules');
}

export default {
  contextMatchFn({ codeBasePath }) {
    if (codeBasePath.isDir) return null;
    if (pathHasNodeModules(codeBasePath.path)) return null;
    if (!codeBasePath.path.endsWith(${suffixLit})) return null;
    return { contextName: contextNameFromPath(codeBasePath.path), filePathVariableName: 'FILE' };
  },
  prompt: {
    promptTemplate: ${promptLit},
    command: ${commandLit},
  },
};
`;
}

async function writeJsTsStub(input: {
    configPath: string;
    suffix: string;
    commandTag: string;
}): Promise<Success<void> | Failure<string>> {
    try {
        await fs.mkdir(path.dirname(input.configPath), { recursive: true });
        await fs.writeFile(input.configPath, contextMatchFnStubSource(input), 'utf-8');
        return success(undefined);
    } catch (error: unknown) {
        return failure(`Cannot write ${input.configPath}: ${String(error)}`);
    }
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
    const hasStaged = await execAsync('git diff --cached --quiet', { cwd: input.projectRoot });
    if (!hasStaged.success) {
        const commitResult = await execAsync(commitCmd, { cwd: input.projectRoot });
        if (!commitResult.success) return failure(`Failed to commit setup files: ${commitResult.data.message}`);
    }
    const pushResult = await execAsync(pushCmd, { cwd: input.projectRoot });
    if (!pushResult.success) return failure(`Failed to push setup files: ${pushResult.data.message}`);
    return success(undefined);
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
            noteWorkerNextStep(input.note);
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
            noteWorkerNextStep(input.note);
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
        noteWorkerNextStep(input.note);
        return success({ projectRoot: input.projectRoot, lumpName: input.lumpName, branchName });
    } finally {
        disposeAbortHandlers();
    }
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { ...(value as Record<string, unknown>) };
    }
    return {};
}

async function writeMergedLocalJson(input: {
    lumpcodeDir: string;
    existing: Record<string, unknown>;
    mode: Mode;
    workspaceStrategy?: WorkspaceStrategy;
    maxParallelRun?: number;
}): Promise<Success<void> | Failure<string>> {
    const data: Record<string, unknown> = { ...input.existing, mode: input.mode };
    if (input.mode === 'shared') {
        delete data.workspaceStrategy;
        delete data.maxParallelRun;
    } else if (input.workspaceStrategy !== undefined) {
        data.workspaceStrategy = input.workspaceStrategy;
        if (input.maxParallelRun !== undefined) data.maxParallelRun = input.maxParallelRun;
        else delete data.maxParallelRun;
    } else {
        delete data.workspaceStrategy;
        delete data.maxParallelRun;
    }
    return writeJsonFile({
        filePath: path.join(input.lumpcodeDir, LOCAL_CONFIG_FILE_NAME),
        data,
        pretty: true,
        trailingNewline: true,
    });
}

async function findExistingLumpConfig(
    lumpcodeDir: string,
): Promise<{ lumpName: string; configPath: string } | undefined> {
    for (const lumpName of await discoverLumpNames(lumpcodeDir)) {
        const lumpDir = lumpDirPath({ localConfigFolderPath: lumpcodeDir, lumpName });
        for (const name of CONFIG_FILE_NAMES) {
            const configPath = path.join(lumpDir, name);
            if (await pathExists(configPath)) return { lumpName, configPath };
        }
    }
    return undefined;
}

async function maybeStartDedicatedDaemon(input: {
    mode: Mode;
    projectRoot: string;
    lumpcodeDir: string;
    prompter: SetupPrompter;
    note: (line: string) => void;
    logger: ReturnType<typeof createCliLogger>;
    verbose: boolean;
}): Promise<Success<{ startedDaemon?: boolean }> | Failure<Output>> {
    if (input.mode !== 'dedicated') return success({});
    const startWorker = await input.prompter.confirm({
        message: 'Leave a worker running?',
        defaultValue: true,
    });
    if (!startWorker) return success({});

    const frozen = await readProjectLocalConfig({ localConfigFolderPath: input.lumpcodeDir });
    if (!frozen.success) return commandFailure(frozen.data);
    const nameResult = await getProjectName({
        localConfigFolderPath: input.lumpcodeDir,
        projectRoot: input.projectRoot,
    });
    if (!nameResult.success) return commandFailure(nameResult.data);

    const launched = await launchStartDaemon({
        recipe: {
            projectRoot: input.projectRoot,
            daemonId: RESERVED_DAEMON_ID,
            cronSetup: DEFAULT_DAEMON_CRON_SETUP,
            workspaceStrategy: frozen.data.workspaceStrategy,
        },
        frozenLocalConfig: frozen.data,
        localConfigFolderPath: input.lumpcodeDir,
        globalConfigFolderPath,
        projectName: nameResult.data,
        json: false,
        cliVerbose: input.verbose,
        foreground: false,
        logger: input.logger,
    });
    if (!launched.success) {
        return failure({ messages: launched.data.messages });
    }
    for (const line of launched.data.messages) input.note(line);
    input.note('Later: lumpcode daemon-status, lumpcode daemon-log, lumpcode stop.');
    return success({ startedDaemon: true });
}
