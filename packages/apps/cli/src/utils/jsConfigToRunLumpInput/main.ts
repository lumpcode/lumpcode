import * as path from 'node:path';
import type { 
    RunLumpInput,
    BranchFn,
    CommandFn,
    Failure,
    GetContextListFn,
    Logger,
    PostCommandExecFn,
    PromptFn,
    PromptFnInput,
    Step,
    Steps,
    SetupFn,
    Success,
    TeardownFn,
    GetContextListFnOutput,
    Context,
} from "@lumpcode/core";
import { success, failure, noopLogger } from "@lumpcode/core";
import { ensurePresetCommandsInstalled } from "../ensurePresetCommandsInstalled";
import { getCommandPath } from "../getCommandPath";
import { readJson } from "../readJson";
import { makeGetContextListFnFromTemplate } from "../makeGetContextListFnFromTemplate";

import type { CommandModule, ContextMatchFn, ContextOptionsFn, LumpJsConfig, LumpJsConfigStep, CommandConfigPaths } from "../../types";
import { makePromptFnFromTemplate } from '../makePromptFnFromTemplate';
import { makeGitCommitMessageFnFromLumpName } from '../makeGitCommitMessageFnFromLumpName';
import { resolveImportable } from '../resolveImportable';
import { resolveFnOrDefaultImport } from '../resolveFnOrDefaultImport';
import { makeLumpWorkspaceFns } from '../makeLumpWorkspaceFns';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import type { LocalConfig } from '../../types/LocalConfig';
import { resolveLumpBaseBranch } from '../resolveLumpBranches';
import { resolvePrimaryBranch } from '../resolvePrimaryBranches';
import { lumpBranchName } from '../lumpBranchName';
import { lumpImportBasePath } from '../lumpDirPath';
import { lumpHistoryFilePath } from '../lumpHistoryFilePath';

export async function jsConfigToRunLumpInput({
    config,
    lumpName,
    localConfigFolderPath,
    globalConfigFolderPath,
    projectBaseBranch,
    executionWorkspacePath,
    workspaceStrategy = 'checkout',
    logger = noopLogger,
    localConfig,
}: {
    config: LumpJsConfig;
    lumpName: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    /** Resolved lump execution branch (from pre-flight) or primary branch from local.json. */
    projectBaseBranch: string;
    /** Execution workspace (git repo root) resolved by pre-flight. */
    executionWorkspacePath: string;
    workspaceStrategy?: WorkspaceStrategy;
    logger?: Logger;
    /** When set, resolves lump baseBranch via the full discovery/base fallback chain. */
    localConfig?: LocalConfig;
}): Promise<Success<RunLumpInput> | Failure<string>> {
    const {
        baseBranch: lumpBaseBranchOverride,
        command: defaultCommand,
        contextListJson,
        contextMatchFn,
        contextOptionsFn,
        disabled,
        getContextListFn,
        keepHistory,
        maximumNumberOfConcurrentBranches,
        prompt,
        steps: jsSteps,
        registerCommands,
        setupFn: userSetupFn,
        teardownFn: userTeardownFn,
        verbose: _configVerbose,
        ...rest
    } = config;

    const presetInstallResult = await ensurePresetCommandsInstalled({ globalConfigFolderPath });
    if (!presetInstallResult.success) return presetInstallResult;

    const projectRoot = path.dirname(localConfigFolderPath);
    const baseBranch = localConfig
        ? resolveLumpBaseBranch({
            lumpConfig: config,
            primaryBranch: resolvePrimaryBranch(localConfig),
            mode: localConfig.mode,
        })
        : (lumpBaseBranchOverride ?? config.discoveryBranch ?? projectBaseBranch);
    const fnImportOptions = { importBasePath: lumpImportBasePath({ localConfigFolderPath, lumpName }) };

    const { setupWorkspaceFn, teardownWorkspaceFn } = makeLumpWorkspaceFns({
        executionWorkspacePath: path.resolve(executionWorkspacePath), // TODO : why need path.resolve ?
        projectBaseBranch,
        lumpBaseBranch: baseBranch,
        workspaceStrategy,
    });

    const gitCommitMessageFn = makeGitCommitMessageFnFromLumpName(lumpName);

    const commandModules = new Map<string, CommandModule>();
    
    const configPaths: CommandConfigPaths = {
        localConfigFolderPath,
        globalConfigFolderPath,
    };

    if (registerCommands) {
        const preRegResult = await preRegisterCommands({ commandNames: registerCommands, commandModules, configPaths });
        if (!preRegResult.success) return preRegResult;
    }

    let resolvedUserSetupFn: SetupFn | undefined;
    if (userSetupFn) {
        const setupResult = await resolveFnOrDefaultImport<SetupFn>(userSetupFn, fnImportOptions);
        if (!setupResult.success) return setupResult;
        resolvedUserSetupFn = setupResult.data;
    }

    let resolvedUserTeardownFn: TeardownFn | undefined;
    if (userTeardownFn) {
        const teardownResult = await resolveFnOrDefaultImport<TeardownFn>(userTeardownFn, fnImportOptions);
        if (!teardownResult.success) return teardownResult;
        resolvedUserTeardownFn = teardownResult.data;
    }

    const getContextListFnResult = await resolveGetContextListFn({
        contextListJson,
        contextMatchFn,
        configBasePath: localConfigFolderPath,
        fnImportOptions,
        getContextListFn,
        contextOptionsFn,
    });
    if (!getContextListFnResult.success) return getContextListFnResult;

    const stepsResult = await resolveSteps({
        prompt, jsSteps, defaultCommand, commandModules, configPaths, fnImportOptions,
    });
    if (!stepsResult.success) return stepsResult;

    const branchFnResult = await makeBranchFn(lumpName);
    if (!branchFnResult.success) return branchFnResult;

    const getKeepHistoryFilePathFn = resolveGetKeepHistoryFilePathFn({
        keepHistory,
        lumpName,
        projectRoot,
    });

    const retConf: RunLumpInput = {
        ...rest,
        baseBranch,
        projectRoot,
        branchFn: branchFnResult.data,
        getContextListFn: getContextListFnResult.data,
        gitCommitMessageFn,
        steps: stepsResult.data,
        setupFn: composeSetupFn({ userSetupFn: resolvedUserSetupFn, commandModules }),
        teardownFn: composeTeardownFn({ userTeardownFn: resolvedUserTeardownFn, commandModules }),
        setupWorkspaceFn,
        teardownWorkspaceFn,
        getKeepHistoryFilePathFn,
        logger,
    };

    return success(retConf);
}

function resolveGetKeepHistoryFilePathFn({
    keepHistory,
    lumpName,
    projectRoot,
}: {
    keepHistory?: boolean;
    lumpName: string;
    projectRoot: string;
}): RunLumpInput['getKeepHistoryFilePathFn'] {
    if (!keepHistory) return () => undefined;
    return context => lumpHistoryFilePath({ projectRoot, lumpName, contextName: context.name });
}

function composeSetupFn({
    userSetupFn,
    commandModules,
}: {
    userSetupFn: SetupFn | undefined;
    commandModules: Map<string, CommandModule>;
}): SetupFn {
    return async (params) => {
        const userResult = await userSetupFn?.(params);
        const contextRunState = { ...userResult?.contextRunState };

        for (const [cmdName, mod] of commandModules) {
            if (mod.setup) {
                const cmdResult = await mod.setup(params);
                contextRunState[`${cmdName}Setup`] = cmdResult?.contextRunState ?? {};
            }
        }

        return { contextRunState };
    };
}

function composeTeardownFn({
    userTeardownFn,
    commandModules,
}: {
    userTeardownFn: TeardownFn | undefined;
    commandModules: Map<string, CommandModule>;
}): TeardownFn {
    return async (params) => {
        for (const [, mod] of commandModules) {
            if (mod.teardown) {
                await mod.teardown(params);
            }
        }
        await userTeardownFn?.(params);
    };
}

async function preRegisterCommands({
    commandNames,
    commandModules,
    configPaths,
}: {
    commandNames: string[];
    commandModules: Map<string, CommandModule>;
    configPaths: CommandConfigPaths;
}): Promise<Success<void> | Failure<string>> {
    const results = await Promise.all(commandNames.map((name) => {
        if (commandModules.has(name)) return success(undefined);
        return loadCommandModule({ name, commandModules, configPaths });
    }));
    const failed = results.find((r) => !r.success);
    if (failed && !failed.success) return failed;
    return success(undefined);
}

async function makeBranchFn(lumpName: string): Promise<Success<BranchFn> | Failure<string>> {
    return success(({ contextList }) => lumpBranchName({ lumpName, contextList }));
}

async function resolveGetContextListFn({
    contextListJson,
    contextMatchFn,
    configBasePath,
    fnImportOptions,
    getContextListFn,
    contextOptionsFn,
}: {
    contextListJson: LumpJsConfig['contextListJson'];
    contextMatchFn: LumpJsConfig['contextMatchFn'];
    configBasePath: string;
    fnImportOptions: { importBasePath: string };
    getContextListFn: LumpJsConfig['getContextListFn'];
    contextOptionsFn: LumpJsConfig['contextOptionsFn'];
}): Promise<Success<GetContextListFn> | Failure<string>> {
    if (getContextListFn) {
        return resolveFnOrDefaultImport<GetContextListFn>(getContextListFn, fnImportOptions);
    }

    if (contextMatchFn) {
        const matchFnResult = await resolveFnOrDefaultImport<ContextMatchFn>(contextMatchFn, fnImportOptions);
        if (!matchFnResult.success) return matchFnResult;
        return success(createGetContextListFromMatchFn(matchFnResult.data));
    }

    if (contextListJson) {
        let template: Record<string, string>;
        if (typeof contextListJson === 'object') {
            template = contextListJson;
        } else {
            const resolvedPath = path.resolve(configBasePath, contextListJson);
            const readResult = await readJson<Record<string, string>>(resolvedPath);
            if (!readResult.success) {
                const msg = (readResult.data as { message?: string })?.message ?? 'Failed to load contextListJson file';
                return failure(msg);
            }
            template = readResult.data;
        }
        let resolvedContextOptionsFn: ContextOptionsFn | undefined;
        if (contextOptionsFn) {
            const coResult = await resolveFnOrDefaultImport<ContextOptionsFn>(contextOptionsFn, fnImportOptions);
            if (!coResult.success) return coResult;
            resolvedContextOptionsFn = coResult.data;
        }
        const templateFn = makeGetContextListFnFromTemplate(
            template,
            undefined,
            resolvedContextOptionsFn,
        );
        return success(
            (params) => templateFn(params),
        );
    }

    return failure('Either getContextListFn, contextMatchFn, or contextListJson must be provided');
}

function createGetContextListFromMatchFn(matchFn: ContextMatchFn): GetContextListFn {
    return async ({ codeBasePaths, lumpVariables }) => {
        const contextsRecord: Record<string, Context> = {};
        for (const codeBasePath of codeBasePaths) {
            const match = await matchFn({ codeBasePath, codeBasePaths, lumpVariables });
            if (match) {
                const contextName = match.contextName;
                const currentContext = contextsRecord[contextName];
                contextsRecord[contextName] = {
                    ...currentContext,
                    name: contextName,
                    variables: {
                        ...currentContext?.variables,
                        [match.filePathVariableName]: codeBasePath.path,
                        ...match.moreContextVariables,
                    },
                    ...(match.contextOptions && { 
                        options: {
                            ...currentContext?.options,
                            ...match.contextOptions,
                        },
                    }),
                };
            }
        }
        return Object.values(contextsRecord);
    };
}

async function resolveSteps({
    prompt,
    jsSteps,
    defaultCommand,
    commandModules,
    configPaths,
    fnImportOptions,
    inRecursiveCall,
}: {
    prompt: LumpJsConfig['prompt'];
    jsSteps: LumpJsConfig['steps'];
    defaultCommand: LumpJsConfig['command'];
    commandModules: Map<string, CommandModule>;
    configPaths: CommandConfigPaths;
    fnImportOptions: { importBasePath: string };
    inRecursiveCall?: boolean;
}): Promise<Success<Steps> | Failure<string>> {
    const result: Steps = [];

    if (prompt) {
        const stepResult = await resolvePromptShorthand({ prompt, defaultCommand, commandModules, configPaths, fnImportOptions });
        if (!stepResult.success) return stepResult;
        result.push(stepResult.data);
    }

    if (jsSteps) {
        for (const item of jsSteps) {
            if (typeof item === 'function') {
                const fn = item;
                result.push(async (input: Exclude<PromptFnInput, 'stepVariables'>): Promise<Steps> => {
                    const resolved = await fn(input);
                    if (!Array.isArray(resolved) || resolved.length === 0) {
                        return [];
                    }
                    const subResult = await resolveSteps({
                        prompt: undefined,
                        jsSteps: resolved,
                        defaultCommand,
                        commandModules,
                        configPaths,
                        fnImportOptions,
                        inRecursiveCall: true,
                    });
                    if (!subResult.success) throw new Error(subResult.data);
                    return subResult.data;
                });
            } else if (item) {
                const normalizedItem =
                    typeof item === 'string'
                        ? ({ promptTemplate: item } as LumpJsConfigStep)
                        : item;

                const resolved = await jsConfigStepToStep({
                    item: normalizedItem,
                    defaultCommand,
                    commandModules,
                    configPaths,
                    fnImportOptions,
                    inRecursiveCall,
                });
                if (!resolved.success) return resolved;
                result.push(resolved.data);
            }
        }
    }

    if (result.length === 0) {
        return failure('At least one prompt or step must be provided');
    }

    return success(result);
}

async function resolvePromptShorthand({
    prompt,
    defaultCommand,
    commandModules,
    configPaths,
    fnImportOptions,
}: {
    prompt: NonNullable<LumpJsConfig['prompt']>;
    defaultCommand: LumpJsConfig['command'];
    commandModules: Map<string, CommandModule>;
    configPaths: CommandConfigPaths;
    fnImportOptions: { importBasePath: string };
}): Promise<Success<Step> | Failure<string>> {
    const configStep: LumpJsConfigStep =
        typeof prompt === 'function'
            ? ({ promptFn: prompt } as LumpJsConfigStep)
            : typeof prompt === 'string'
                ? ({ promptTemplate: prompt } as LumpJsConfigStep)
                : (prompt as LumpJsConfigStep);

    return jsConfigStepToStep({
        item: configStep,
        defaultCommand,
        commandModules,
        configPaths,
        fnImportOptions,
    });
}

async function jsConfigStepToStep({
    item,
    defaultCommand,
    commandModules,
    configPaths,
    fnImportOptions,
    inRecursiveCall,
}: {
    item: LumpJsConfigStep;
    defaultCommand: LumpJsConfig['command'];
    commandModules: Map<string, CommandModule>;
    configPaths: CommandConfigPaths;
    fnImportOptions: { importBasePath: string };
    inRecursiveCall?: boolean;
}): Promise<Success<Step> | Failure<string>> {
    const { promptTemplate, promptFn, command, postCommandExecFn, ...rest } = item;

    const promptFnResult = await resolvePromptFn({ promptFn, promptTemplate, fnImportOptions });
    if (!promptFnResult.success) return promptFnResult;

    const commandFnResult = await resolveCommandFn({
        command: command ?? defaultCommand,
        existingCommandFn: rest.commandFn,
        commandModules, configPaths, inRecursiveCall,
    });
    if (!commandFnResult.success) return commandFnResult;

    let resolvedPostCommandExecFn: PostCommandExecFn | undefined =
        typeof postCommandExecFn === 'function' ? postCommandExecFn : undefined;
    if (typeof postCommandExecFn === 'string') {
        const postCommandExecResult = await resolveFnOrDefaultImport<PostCommandExecFn>(postCommandExecFn, fnImportOptions);
        if (!postCommandExecResult.success) return postCommandExecResult;
        resolvedPostCommandExecFn = postCommandExecResult.data;
    }

    return success({
        ...rest,
        ...(promptFnResult.data !== undefined && { promptFn: promptFnResult.data }),
        commandFn: commandFnResult.data,
        ...(resolvedPostCommandExecFn !== undefined && { postCommandExecFn: resolvedPostCommandExecFn }),
    });
}

async function resolvePromptFn({
    promptFn,
    promptTemplate,
    fnImportOptions,
}: {
    promptFn: LumpJsConfigStep['promptFn'];
    promptTemplate: LumpJsConfigStep['promptTemplate'];
    fnImportOptions: { importBasePath: string };
}): Promise<Success<PromptFn | undefined> | Failure<string>> {
    if (promptFn) {
        return resolveFnOrDefaultImport<PromptFn>(promptFn, fnImportOptions);
    }

    if (promptTemplate !== undefined) {
        const promptFn = makePromptFnFromTemplate(promptTemplate);
        return success(promptFn);
    }

    return success(undefined);
}

async function resolveCommandFn({
    command,
    existingCommandFn,
    commandModules,
    configPaths,
    inRecursiveCall,
}: {
    command: LumpJsConfigStep['command'] | undefined;
    existingCommandFn: CommandFn | undefined;
    commandModules: Map<string, CommandModule>;
    configPaths: CommandConfigPaths;
    inRecursiveCall?: boolean;
}): Promise<Success<CommandFn> | Failure<string>> {
    if (existingCommandFn) return success(existingCommandFn);

    if (typeof command === 'function') return success(command);

    if (typeof command === 'string') {
        if (!commandModules.has(command)) {
            if (inRecursiveCall) {
                throw new Error(`Command ${command} not registered in recursive call. Please register the command before in the registerCommands field.`);
            }
            const loadResult = await loadCommandModule({ name: command, commandModules, configPaths });
            if (!loadResult.success) return loadResult;
        }
        const resolved = commandModules.get(command)!;
        const fn: CommandFn = resolved.command;
        fn.commandName = command;
        return success(fn);
    }

    return failure('Step must have a command or commandFn');
}

async function loadCommandModule({
    name,
    commandModules,
    configPaths,
}: {
    name: string;
    commandModules: Map<string, CommandModule>;
    configPaths: CommandConfigPaths;
}): Promise<Success<void> | Failure<string>> {
    const commandPath = await getCommandPath(name, configPaths);
    const mod = await resolveImportable<CommandModule>(commandPath, null);
    if (!mod.success) return failure(`Failed to load command module '${name}': ${mod.data}`);
    const modData = mod.data;
    commandModules.set(name, {
        command: modData.command,
        setup: modData.setup,
        teardown: modData.teardown,
    });
    return success(undefined);
}
