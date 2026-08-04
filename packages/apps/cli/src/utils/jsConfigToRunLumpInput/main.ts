import * as fs from 'node:fs/promises';
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
    Context,
} from "@lumpcode/core";
import { success, failure, pathExists } from "@lumpcode/core";
import { noopLogger } from '../noopLogger';
import { readJsonFile } from '../readJsonFile';
import { ensurePresetCommandsInstalled } from "../ensurePresetCommandsInstalled";
import { getCommandPath } from "../getCommandPath";
import { makeGetContextListFnFromTemplate } from "../makeGetContextListFnFromTemplate";

import type {
    BaseBranchFn,
    CommandModule,
    ContextMatchFn,
    ContextOptionsFn,
    GetContextListFn as AuthorGetContextListFn,
    LumpJsConfig,
    LumpJsConfigPostCommandExecFn,
    LumpJsConfigStep,
    CommandConfigPaths,
} from "../../types";
import { isCommandFileRef } from '../lumpConfigPathRef';
import { isGitRefGlob } from '../isGitRefGlob';
import { makePromptFnFromTemplate } from '../makePromptFnFromTemplate';
import { makeGitCommitMessageFnFromLumpName } from '../makeGitCommitMessageFnFromLumpName';
import { resolveImportable } from '../resolveImportable';
import { resolveFnOrDefaultImport } from '../resolveFnOrDefaultImport';
import { resolvePromptTemplateString } from '../resolvePromptTemplateString';
import { makeLumpWorkspaceFns } from '../makeLumpWorkspaceFns';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import type { LocalConfig } from '../../types/LocalConfig';
import { resolveLumpBaseBranch, resolveLumpDiscoveryBranch } from '../resolveLumpBranches';
import { resolvePrimaryBranch } from '../resolvePrimaryBranches';
import { lumpBranchName } from '../lumpBranchName';
import { lumpImportBasePath } from '../lumpDirPath';
import { lumpHistoryFilePath } from '../lumpHistoryFilePath';
import { normalizeSteps } from './normalizeSteps';

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
    effectiveDiscoveryBranch: providedEffectiveDiscoveryBranch,
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
    /** Concrete discovery branch bound for author context source + baseBranch resolve. */
    effectiveDiscoveryBranch?: string;
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
    const fnImportOptions = { importBasePath: lumpImportBasePath({ localConfigFolderPath, lumpName }) };

    let concreteDiscovery: string;
    if (providedEffectiveDiscoveryBranch !== undefined) {
        concreteDiscovery = providedEffectiveDiscoveryBranch;
    } else if (localConfig) {
        try {
            concreteDiscovery = resolveLumpDiscoveryBranch({
                lumpConfig: config,
                primaryBranch: resolvePrimaryBranch(localConfig, logger),
                mode: localConfig.mode,
            });
        } catch (err) {
            return failure(err instanceof Error ? err.message : String(err));
        }
    } else if (
        typeof config.discoveryBranch === 'string' &&
        !isGitRefGlob(config.discoveryBranch)
    ) {
        concreteDiscovery = config.discoveryBranch;
    } else {
        concreteDiscovery = projectBaseBranch;
    }

    const getContextListFnResult = await resolveGetContextListFn({
        contextListJson,
        contextMatchFn,
        configBasePath: localConfigFolderPath,
        fnImportOptions,
        getContextListFn,
        contextOptionsFn,
        discoveryBranch: concreteDiscovery,
    });
    if (!getContextListFnResult.success) return getContextListFnResult;

    const authorGetContextListFn = getContextListFnResult.data;
    let cachedRawContexts: Context[] | undefined;
    const coreGetContextListFn: GetContextListFn = async (params) => {
        if (cachedRawContexts === undefined) {
            cachedRawContexts = await authorGetContextListFn(params);
        }
        return cachedRawContexts;
    };

    const needsRawContextsEarly =
        typeof lumpBaseBranchOverride === 'function' ||
        (typeof lumpBaseBranchOverride === 'string' ? false : lumpBaseBranchOverride !== undefined);

    let rawContextsForBaseBranch: Context[] = [];
    if (needsRawContextsEarly) {
        rawContextsForBaseBranch = await coreGetContextListFn({
            codeBasePaths: [],
            lumpVariables: config.lumpVariables ?? {},
        });
    }

    const baseBranchResult = await resolveConcreteBaseBranch({
        lumpBaseBranchOverride,
        config,
        localConfig,
        logger,
        projectBaseBranch,
        concreteDiscovery,
        fnImportOptions,
        rawContexts: rawContextsForBaseBranch,
    });
    if (!baseBranchResult.success) return baseBranchResult;
    const baseBranch = baseBranchResult.data;

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
        getContextListFn: coreGetContextListFn,
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

async function resolveConcreteBaseBranch(input: {
    lumpBaseBranchOverride: LumpJsConfig['baseBranch'];
    config: LumpJsConfig;
    localConfig?: LocalConfig;
    logger: Logger;
    projectBaseBranch: string;
    concreteDiscovery: string;
    fnImportOptions: { importBasePath: string };
    rawContexts: Context[];
}): Promise<Success<string> | Failure<string>> {
    const {
        lumpBaseBranchOverride,
        config,
        localConfig,
        logger,
        projectBaseBranch,
        concreteDiscovery,
        fnImportOptions,
        rawContexts,
    } = input;

    if (lumpBaseBranchOverride === undefined) {
        if (localConfig) {
            return success(
                resolveLumpBaseBranch({
                    lumpConfig: {
                        discoveryBranch: config.discoveryBranch,
                        discoveryBranches: config.discoveryBranches,
                    },
                    primaryBranch: resolvePrimaryBranch(localConfig, logger),
                    mode: localConfig.mode,
                    effectiveDiscoveryBranch: concreteDiscovery,
                }),
            );
        }
        return success(concreteDiscovery);
    }

    if (typeof lumpBaseBranchOverride === 'string') {
        if (isGitRefGlob(lumpBaseBranchOverride)) {
            return failure('baseBranch must be a concrete branch name');
        }
        return success(lumpBaseBranchOverride);
    }

    if (typeof lumpBaseBranchOverride === 'function') {
        const resolved = await lumpBaseBranchOverride({
            effectiveDiscoveryBranch: concreteDiscovery,
            contexts: rawContexts,
        });
        if (typeof resolved !== 'string' || !resolved.trim() || isGitRefGlob(resolved)) {
            return failure('baseBranch function must return a non-empty concrete branch name');
        }
        return success(resolved.trim());
    }

    // FilePath module
    const fnResult = await resolveFnOrDefaultImport<BaseBranchFn>(
        lumpBaseBranchOverride,
        fnImportOptions,
    );
    if (!fnResult.success) return fnResult;
    const resolved = await fnResult.data({
        effectiveDiscoveryBranch: concreteDiscovery,
        contexts: rawContexts,
    });
    if (typeof resolved !== 'string' || !resolved.trim() || isGitRefGlob(resolved)) {
        return failure('baseBranch function must return a non-empty concrete branch name');
    }
    return success(resolved.trim());
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
    const results = await Promise.all(commandNames.map(async (name) => {
        if (commandModules.has(name)) return success(undefined);
        return loadCommandModule({
            cacheKey: name,
            commandModules,
            importPath: await getCommandPath(name, configPaths),
        });
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
    discoveryBranch,
}: {
    contextListJson: LumpJsConfig['contextListJson'];
    contextMatchFn: LumpJsConfig['contextMatchFn'];
    configBasePath: string;
    fnImportOptions: { importBasePath: string };
    getContextListFn: LumpJsConfig['getContextListFn'];
    contextOptionsFn: LumpJsConfig['contextOptionsFn'];
    discoveryBranch: string;
}): Promise<Success<GetContextListFn> | Failure<string>> {
    if (getContextListFn) {
        const authorResult = await resolveFnOrDefaultImport<AuthorGetContextListFn>(
            getContextListFn,
            fnImportOptions,
        );
        if (!authorResult.success) return authorResult;
        const authorFn = authorResult.data;
        return success(async ({ codeBasePaths, lumpVariables }) =>
            authorFn({ codeBasePaths, lumpVariables, discoveryBranch }),
        );
    }

    if (contextMatchFn) {
        const matchFnResult = await resolveFnOrDefaultImport<ContextMatchFn>(contextMatchFn, fnImportOptions);
        if (!matchFnResult.success) return matchFnResult;
        return success(createGetContextListFromMatchFn(matchFnResult.data, discoveryBranch));
    }

    if (contextListJson) {
        let template: Record<string, string>;
        if (typeof contextListJson === 'object') {
            template = contextListJson;
        } else {
            const resolvedPath = path.resolve(configBasePath, contextListJson);
            const readResult = await readJsonFile<Record<string, string>>({ filePath: resolvedPath });
            if (!readResult.success) {
                return readResult;
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

function createGetContextListFromMatchFn(
    matchFn: ContextMatchFn,
    discoveryBranch: string,
): GetContextListFn {
    return async ({ codeBasePaths, lumpVariables }) => {
        const contextsRecord: Record<string, Context> = {};
        for (const codeBasePath of codeBasePaths) {
            const match = await matchFn({
                codeBasePath,
                codeBasePaths,
                lumpVariables,
                discoveryBranch,
            });
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

    const normalizedSteps = normalizeSteps({ prompt, jsSteps });

    for (const item of normalizedSteps) {
        if (typeof item === 'function') {
            const fn = item;
            result.push(async (input: Omit<PromptFnInput, 'stepVariables'>): Promise<Steps> => {
                const resolved = await fn(input);
                if (resolved == null || (Array.isArray(resolved) && resolved.length === 0)) {
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

    if (result.length === 0) {
        return failure('At least one prompt or step must be provided');
    }

    return success(result);
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
        commandModules,
        configPaths,
        fnImportOptions,
        inRecursiveCall,
    });
    if (!commandFnResult.success) return commandFnResult;

    let authorPostCommandExecFn: LumpJsConfigPostCommandExecFn | undefined =
        typeof postCommandExecFn === 'function' ? postCommandExecFn : undefined;
    if (typeof postCommandExecFn === 'string') {
        const postCommandExecResult = await resolveFnOrDefaultImport<LumpJsConfigPostCommandExecFn>(
            postCommandExecFn,
            fnImportOptions,
        );
        if (!postCommandExecResult.success) return postCommandExecResult;
        authorPostCommandExecFn = postCommandExecResult.data;
    }

    let resolvedPostCommandExecFn: PostCommandExecFn | undefined;
    if (authorPostCommandExecFn) {
        const userFn = authorPostCommandExecFn;
        resolvedPostCommandExecFn = async (input) => {
            const returned = await userFn(input);
            if (returned == null || (Array.isArray(returned) && returned.length === 0)) {
                return;
            }
            const subResult = await resolveSteps({
                prompt: undefined,
                jsSteps: returned,
                defaultCommand,
                commandModules,
                configPaths,
                fnImportOptions,
                inRecursiveCall: true,
            });
            if (!subResult.success) throw new Error(subResult.data);
            return subResult.data;
        };
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
        const templateResult = await resolvePromptTemplateString({
            value: promptTemplate,
            importBasePath: fnImportOptions.importBasePath,
        });
        if (!templateResult.success) return templateResult;
        const promptFn = makePromptFnFromTemplate(templateResult.data);
        return success(promptFn);
    }

    return success(undefined);
}

async function resolveCommandFn({
    command,
    existingCommandFn,
    commandModules,
    configPaths,
    fnImportOptions,
    inRecursiveCall,
}: {
    command: LumpJsConfigStep['command'] | undefined;
    existingCommandFn: CommandFn | undefined;
    commandModules: Map<string, CommandModule>;
    configPaths: CommandConfigPaths;
    fnImportOptions: { importBasePath: string };
    inRecursiveCall?: boolean;
}): Promise<Success<CommandFn> | Failure<string>> {
    if (existingCommandFn) return success(existingCommandFn);

    if (typeof command === 'function') return success(command);

    if (typeof command === 'string') {
        if (isCommandFileRef(command)) {
            if (!commandModules.has(command)) {
                const loadResult = await loadCommandModule({
                    cacheKey: command,
                    commandModules,
                    importPath: command,
                    importBasePath: fnImportOptions.importBasePath,
                });
                if (!loadResult.success) return loadResult;
            }
        } else if (!commandModules.has(command)) {
            if (inRecursiveCall) {
                throw new Error(`Command ${command} not registered in recursive call. Please register the command before in the registerCommands field.`);
            }
            const commandPath = await getCommandPath(command, configPaths);
            const loadResult = await loadCommandModule({
                cacheKey: command,
                commandModules,
                importPath: commandPath,
            });
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
    cacheKey,
    commandModules,
    importPath,
    importBasePath,
}: {
    cacheKey: string;
    commandModules: Map<string, CommandModule>;
    importPath: string;
    importBasePath?: string;
}): Promise<Success<void> | Failure<string>> {
    if (importBasePath) {
        const absolutePath = path.resolve(importBasePath, importPath);
        if (!(await pathExists(absolutePath))) {
            return failure(`Command module file not found: ${cacheKey}`);
        }
    }

    const mod = await resolveImportable<CommandModule>(
        importPath,
        null,
        importBasePath ? { importBasePath } : undefined,
    );
    if (!mod.success) return failure(`Failed to load command module '${cacheKey}': ${mod.data}`);
    const modData = mod.data;
    commandModules.set(cacheKey, {
        command: modData.command,
        setup: modData.setup,
        teardown: modData.teardown,
    });
    return success(undefined);
}
