import type { Failure, Logger, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import { applyLumpConfigDefaults } from '../applyLumpConfigDefaults';
import { claimPidAndWriteMeta, removeOwnPidArtifacts } from '../claimPidAndWriteMeta';
import { createCliLogger } from '../createCliLogger';
import { createDaemonLiveMetaWriter, type DaemonLiveMetaWriter } from '../daemonLiveMeta';
import { createDaemonTickScheduler, type TickTrigger } from '../daemonTickScheduler';
import { discoverDedicatedLumpsForScanBranch } from '../discoverDedicatedLumpsForScanBranch';
import { discoverLoadableLumps } from '../discoverLoadableLumpNames';
import { expandPrimaryBranches } from '../expandPrimaryBranches';
import { filterLumpNames } from '../filterLumpNames';
import { getJsConfigFromLumpName } from '../getJsConfigFromLumpName';
import { installDaemonProcessGuards } from '../installDaemonProcessGuards';
import { installProcessShutdown, type ProcessShutdown } from '../installProcessShutdown';
import { fingerprintResolvedLocalConfig } from '../localConfigFingerprint';
import type { LumpLine } from '../lumpLine';
import { readDaemonMeta, type DaemonMetaWrite } from '../readDaemonMeta';
import { reorderDedicatedLumpLines } from '../reorderDedicatedLumpLines';
import { resolvePrimaryBranches } from '../resolvePrimaryBranches';
import {
    isRunLumpLockWaitTimeoutFailure,
    runLumpFromJsConfigFailureMessage,
} from '../runLumpFromJsConfig';
import { runLumpFromLumpName } from '../runLumpFromLumpName';
import { prepareLumpTranscriptFile } from '../lumpTranscriptFilePath';
import { retainLumpcodeLogs } from '../retainLumpcodeLogs';
import { runLumpLinesWithConcurrency } from '../runLumpLinesWithConcurrency';
import {
    scoreDedicatedLumpLineSnapshots,
    snapshotDedicatedLumpLine,
    type DedicatedLumpLineSnapshot,
    type ScoredLumpLine,
} from '../scoreDedicatedLumpLine';
import {
    markStartDaemonDesiredStopping,
    readStartDaemonDesired,
    toMetaWrite,
    type StartDaemonRecipe,
} from '../startDaemonDesired';
import { validateDaemonLaunch } from '../validateDaemonLaunch';

async function shouldDrainDaemon(desiredFilePath: string): Promise<boolean> {
    const desiredResult = await readStartDaemonDesired(desiredFilePath);
    return desiredResult.success && desiredResult.data?.stopping === true;
}

type TickSession = {
    recipe: StartDaemonRecipe;
    frozenLocalConfig: ResolvedProjectLocalConfig;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    projectName: string;
    json: boolean;
    cliVerbose: boolean;
    logger: Logger;
    effectiveConcurrency: number;
    configuredMaxParallelRun: number;
    projectDisabled: boolean;
    liveMeta: DaemonLiveMetaWriter;
    daemonLumpAbortControllers: Set<AbortController>;
    warnings: {
        sharedMultiDiscovery: boolean;
        checkoutParallelism: boolean;
    };
};

type CollectTickLumpLinesResult =
    | { kind: 'noop' }
    | { kind: 'expand-failed' }
    | { kind: 'run'; items: LumpLine[] };

async function collectDedicatedTickLumpLines(session: TickSession): Promise<CollectTickLumpLinesResult> {
    const {
        recipe,
        frozenLocalConfig,
        localConfigFolderPath,
        globalConfigFolderPath,
        logger,
        projectName,
    } = session;
    const { projectRoot } = recipe;

    const expandResult = await expandPrimaryBranches({
        localConfig: frozenLocalConfig,
        cwd: projectRoot,
        logger,
    });
    if (!expandResult.success) {
        logger.error(`primaryBranches expand failed: ${expandResult.data}; skipping tick`);
        return { kind: 'expand-failed' };
    }

    const eligible: ScoredLumpLine[] = [];
    const seenOnScan = new Set<string>();
    for (const scanBranch of expandResult.data) {
        let dediLumpLineSnapshots: DedicatedLumpLineSnapshot[] = [];
        const discoverResult = await discoverDedicatedLumpsForScanBranch({
            scanBranch,
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: frozenLocalConfig,
            logger,
            refreshCommand: frozenLocalConfig.refreshCommand,
            afterMatched: async ({ matchingLumps }) => {
                const matched = new Set(
                    filterLumpNames({
                        names: matchingLumps.map((l) => l.lumpName),
                        include: recipe.include,
                        exclude: recipe.exclude,
                    }),
                );
                const toCollect: typeof matchingLumps = [];
                for (const lump of matchingLumps) {
                    if (!matched.has(lump.lumpName)) continue;
                    const seenKey = `${lump.lumpName}\0${scanBranch}`;
                    if (seenOnScan.has(seenKey)) {
                        logger.warn(
                            `duplicate lump "${lump.lumpName}" on branch "${scanBranch}"; skipping`,
                        );
                        continue;
                    }
                    seenOnScan.add(seenKey);
                    toCollect.push(lump);
                }
                dediLumpLineSnapshots = await Promise.all(
                    toCollect.map(({ lumpName, jsConfig }) =>
                        snapshotDedicatedLumpLine({
                            lumpName,
                            jsConfig,
                            effectiveDiscoveryBranch: scanBranch,
                            localConfigFolderPath,
                            globalConfigFolderPath,
                            sourceProjectRoot: projectRoot,
                            localConfig: frozenLocalConfig,
                            logger,
                            projectName,
                        }),
                    ),
                );
            },
        });
        if (!discoverResult.success) {
            logger.error(`discovery branch "${scanBranch}": ${discoverResult.data}; skipping`);
            continue;
        }
        const scoredItems = await scoreDedicatedLumpLineSnapshots({
            snapshots: dediLumpLineSnapshots,
            logger,
            globalConfigFolderPath,
            projectName,
            lockMode: 'wait',
        });
        for (const item of scoredItems) {
            if (item.lineScore.kind === 'failed') {
                logger.warn(
                    `lump "${item.lumpName}" on "${scanBranch}": line score failed (${item.lineScore.reason}); leaving in collect order`,
                );
            }
            eligible.push(item);
        }
    }
    return { kind: 'run', items: reorderDedicatedLumpLines(eligible) };
}

async function collectTickLumpLines(session: TickSession): Promise<CollectTickLumpLinesResult> {
    const {
        recipe,
        frozenLocalConfig,
        localConfigFolderPath,
        logger,
        projectDisabled,
        configuredMaxParallelRun,
        warnings,
    } = session;
    const { workspaceStrategy } = recipe;

    if (projectDisabled) {
        logger.info('- project disabled; skipping tick.');
        return { kind: 'noop' };
    }

    if (
        frozenLocalConfig.mode === 'shared' &&
        resolvePrimaryBranches(frozenLocalConfig).length > 1 &&
        !warnings.sharedMultiDiscovery
    ) {
        logger.info(
            'local.json lists multiple primary branches; multi-branch daemon scans are dedicated-only. ' +
                'Using the primary branch for shared mode.',
        );
        warnings.sharedMultiDiscovery = true;
    }

    if (workspaceStrategy !== 'worktree' && configuredMaxParallelRun > 1 && !warnings.checkoutParallelism) {
        logger.info(
            'maxParallelRun > 1 requires workspaceStrategy "worktree"; running lumps sequentially.',
        );
        warnings.checkoutParallelism = true;
    }

    if (frozenLocalConfig.mode === 'dedicated') {
        return collectDedicatedTickLumpLines(session);
    }

    const loadable = await discoverLoadableLumps({ localConfigFolderPath, logger });
    const names = filterLumpNames({
        names: loadable.map((lump) => lump.lumpName),
        include: recipe.include,
        exclude: recipe.exclude,
    });
    if (names.length === 0) {
        logger.warn('no lumps matched filter this tick; skipping.');
        return { kind: 'noop' };
    }
    return { kind: 'run', items: names.map((lumpName) => ({ lumpName })) };
}

function lumpLineListLabel(input: {
    mode: ResolvedProjectLocalConfig['mode'];
    items: LumpLine[];
}): string {
    if (input.mode === 'dedicated') {
        return input.items.map((item) => `${item.lumpName}@${item.effectiveDiscoveryBranch}`).join(', ');
    }
    return input.items.map((item) => item.lumpName).join(', ');
}

function tickRunningMessage(input: {
    ticks: number;
    trigger: TickTrigger;
    count: number;
    label: string;
}): string {
    const catchUp =
        input.trigger === 'missedFire'
            ? ' (catch-up: missed fire)'
            : input.trigger === 'lockRetry'
              ? ' (catch-up: lock retry)'
              : '';
    const labels = input.count > 0 ? ` [${input.label}]` : '';
    return `tick ${input.ticks}${catchUp} — running ${input.count} lump(s)…${labels}`;
}

async function runLumpLine(
    session: TickSession,
    lumpLine: LumpLine,
    tickStartedAt: string,
): Promise<boolean> {
    const { lumpName } = lumpLine;
    const abortController = new AbortController();
    session.daemonLumpAbortControllers.add(abortController);
    await session.liveMeta.beginLumpLine(lumpLine);
    let owed = false;
    try {
        const jsConfForVerbose = await getJsConfigFromLumpName({
            lumpName,
            localConfigFolderPath: session.localConfigFolderPath,
        });
        const overlaidLumpConfig = jsConfForVerbose.success
            ? applyLumpConfigDefaults({
                  jsConfig: jsConfForVerbose.data,
                  resolved: session.frozenLocalConfig,
              })
            : undefined;
        const lumpLogger = createCliLogger({
            verbose: !!session.cliVerbose || !!overlaidLumpConfig?.verbose,
            json: !!session.json,
            prefix: '[lumpcode start]',
        });
        let liveStepWrite: ((text: string) => void) | undefined;
        const discoveryBranch = lumpLine.effectiveDiscoveryBranch;
        const writeTranscripts =
            overlaidLumpConfig?.writeTranscripts ??
            session.frozenLocalConfig.writeTranscripts;
        if (discoveryBranch && writeTranscripts !== false) {
            const prepared = await prepareLumpTranscriptFile({
                projectRoot: session.recipe.projectRoot,
                lumpName,
                discoveryBranch,
                tickStartedAt,
            });
            if (!prepared.success) {
                session.logger.warn(
                    `lump "${lumpName}": transcript not written: ${prepared.data}`,
                );
            } else {
                liveStepWrite = prepared.data.write;
            }
        }
        const runLumpRes = await runLumpFromLumpName({
            lumpName,
            localConfigFolderPath: session.localConfigFolderPath,
            globalConfigFolderPath: session.globalConfigFolderPath,
            sourceProjectRoot: session.recipe.projectRoot,
            lockMode: 'wait',
            projectName: session.projectName,
            localConfig: session.frozenLocalConfig,
            logger: lumpLogger,
            effectiveDiscoveryBranch: lumpLine.effectiveDiscoveryBranch,
            signal: abortController.signal,
            daemonRunTelemetry: {
                setContextName: session.liveMeta.setContextName,
            },
            liveStepWrite,
        });
        if (!runLumpRes.success) {
            session.logger.error(
                `lump "${lumpName}": ${runLumpFromJsConfigFailureMessage(runLumpRes.data)}`,
            );
            owed = isRunLumpLockWaitTimeoutFailure(runLumpRes.data);
        } else if (runLumpRes.data.skipped) {
            if (runLumpRes.data.reason === 'disabled') {
                session.logger.info(`lump "${lumpName}": skipped (disabled)`);
            } else {
                session.logger.info(
                    `lump "${lumpName}" skipped: ${runLumpRes.data.reason} - ${runLumpRes.data.reasonDetail}`,
                );
            }
        } else {
            const contextNames = runLumpRes.data.result.contextNames;
            session.logger.info(
                `lump "${lumpName}": ok (contexts: ${contextNames.join(', ') || 'none'})`,
            );
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        session.logger.error(`lump "${lumpName}": ${msg}`);
    } finally {
        session.daemonLumpAbortControllers.delete(abortController);
        await session.liveMeta.endLumpLine(lumpLine);
    }
    return owed;
}

async function runCollectedLines(input: {
    session: TickSession;
    items: LumpLine[];
    tickStartedAt: string;
}): Promise<LumpLine[]> {
    const owed: LumpLine[] = [];
    const seen = new Set<string>();
    await runLumpLinesWithConcurrency({
        items: input.items,
        concurrency: input.session.effectiveConcurrency,
        runLumpLine: async (line) => {
            const isOwed = await runLumpLine(input.session, line, input.tickStartedAt);
            if (!isOwed) return;
            const key = `${line.lumpName}\0${line.effectiveDiscoveryBranch ?? ''}`;
            if (seen.has(key)) return;
            seen.add(key);
            owed.push({ ...line });
        },
    });
    return owed;
}

export type RunForegroundStartDaemonInput = {
    recipe: StartDaemonRecipe;
    paths: {
        pidFilePath: string;
        metaFilePath: string;
        desiredFilePath: string;
    };
    frozenLocalConfig: ResolvedProjectLocalConfig;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    projectName: string;
    json: boolean;
    cliVerbose: boolean;
    logger: Logger;
    initialLumps: string[];
    waitForShutdownOverride?: () => Promise<void>;
};

export type RunForegroundStartDaemonOutput = {
    messages: string[];
    data: {
        cronSetup: string;
        lumpNames: string[];
        ticks: number;
        daemonId: string;
        include?: string[];
        exclude?: string[];
        maxParallelRun?: number;
    };
};

export async function runForegroundStartDaemon(
    input: RunForegroundStartDaemonInput,
): Promise<Success<RunForegroundStartDaemonOutput> | Failure<{ messages: string[] }>> {
    const {
        recipe,
        paths: { pidFilePath, metaFilePath, desiredFilePath },
        frozenLocalConfig,
        localConfigFolderPath,
        globalConfigFolderPath,
        projectName,
        json,
        cliVerbose,
        logger,
        initialLumps,
        waitForShutdownOverride,
    } = input;
    const configuredMaxParallelRun = frozenLocalConfig.maxParallelRun ?? 1;
    const effectiveConcurrency =
        recipe.workspaceStrategy === 'worktree'
            ? (recipe.maxParallelRun ?? configuredMaxParallelRun)
            : 1;

    const daemonLumpAbortControllers = new Set<AbortController>();
    const abortAllDaemonLumpRuns = (): void => {
        for (const controller of daemonLumpAbortControllers) {
            controller.abort();
        }
    };

    // Detached parent writes stub meta with daemonConfigFile; desired.json omits it.
    // Adopt the stub marker so file-launched processes keep "ours" after claim.
    let recipeForMeta = recipe;
    if (recipe.daemonConfigFile === undefined) {
        const existingMeta = await readDaemonMeta(metaFilePath);
        if (existingMeta.success && existingMeta.data.daemonConfigFile !== undefined) {
            recipeForMeta = {
                ...recipe,
                daemonConfigFile: existingMeta.data.daemonConfigFile,
            };
        }
    }

    const foregroundMeta: DaemonMetaWrite = {
        ...toMetaWrite(recipeForMeta),
        ...(effectiveConcurrency > 1 || recipe.maxParallelRun !== undefined
            ? { maxParallelRun: effectiveConcurrency }
            : {}),
    };

    const claim = await claimPidAndWriteMeta({
        pid: process.pid,
        pidFilePath,
        meta: { filePath: metaFilePath, data: foregroundMeta },
        onMetaFailure: 'fail',
    });
    if (!claim.success) {
        return failure({ messages: [claim.data] });
    }

    const launchValidation = await validateDaemonLaunch({
        projectRoot: recipe.projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        localConfig: frozenLocalConfig,
        logger,
    });
    if (!launchValidation.success) {
        await removeOwnPidArtifacts({
            pidFilePath,
            extraFilePaths: [metaFilePath, desiredFilePath],
        });
        return failure({ messages: [launchValidation.data] });
    }

    const projectDisabled = frozenLocalConfig.disabled === true;
    if (projectDisabled) {
        logger.info('project disabled in local.json; skipping tick.');
    }

    const liveMeta = createDaemonLiveMetaWriter({
        metaFilePath,
        logger,
        baseMeta: foregroundMeta,
    });
    await liveMeta.writeFingerprintAtStart(fingerprintResolvedLocalConfig(frozenLocalConfig));
    await liveMeta.setTickPhase('idle');

    const session: TickSession = {
        recipe,
        frozenLocalConfig,
        localConfigFolderPath,
        globalConfigFolderPath,
        projectName,
        json,
        cliVerbose,
        logger,
        effectiveConcurrency,
        configuredMaxParallelRun,
        projectDisabled,
        liveMeta,
        daemonLumpAbortControllers,
        warnings: { sharedMultiDiscovery: false, checkoutParallelism: false },
    };

    let ticks = 0;
    let shutdown: ProcessShutdown | undefined;
    const runTick = async (input: {
        trigger: TickTrigger;
        onlyLines?: LumpLine[];
    }): Promise<{ owedLines: LumpLine[] }> => {
        const tickStartedAt = new Date().toISOString();
        logger.info(`${tickStartedAt} - runTick`);
        if (await shouldDrainDaemon(desiredFilePath)) {
            logger.info('desired.json is stopping; draining and skipping tick.');
            shutdown?.shutdown();
            return { owedLines: [] };
        }
        await liveMeta.setTickPhase('running');
        let owedLines: LumpLine[] = [];
        try {
            try {
                const retainResult = await retainLumpcodeLogs({
                    projectRoot: recipe.projectRoot,
                    projectName,
                    globalConfigFolderPath,
                    maxAgeDays: frozenLocalConfig.logRetention?.maxAgeDays,
                    logger,
                });
                if (!retainResult.success) {
                    logger.warn(`log retention failed: ${retainResult.data}`);
                }
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logger.warn(`log retention failed: ${message}`);
            }
            let items: LumpLine[];
            if (input.onlyLines !== undefined) {
                items = input.onlyLines;
            } else {
                const collected = await collectTickLumpLines(session);
                switch (collected.kind) {
                    case 'noop':
                        return { owedLines: [] };
                    case 'expand-failed':
                        ticks += 1;
                        return { owedLines: [] };
                    case 'run':
                        items = collected.items;
                        break;
                    default: {
                        const _exhaustive: never = collected;
                        return _exhaustive;
                    }
                }
            }
            ticks += 1;
            logger.info(
                tickRunningMessage({
                    ticks,
                    trigger: input.trigger,
                    count: items.length,
                    label: lumpLineListLabel({
                        mode: frozenLocalConfig.mode,
                        items,
                    }),
                }),
            );
            if (items.length === 0) {
                return { owedLines: [] };
            }
            owedLines = await runCollectedLines({
                session,
                items,
                tickStartedAt,
            });
            return { owedLines };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.error(`tick failed: ${msg}`);
            return { owedLines };
        } finally {
            await liveMeta.setTickPhase('idle');
            if (await shouldDrainDaemon(desiredFilePath)) {
                shutdown?.shutdown();
            }
        }
    };

    const schedulerResult = await createDaemonTickScheduler({
        cronSetup: recipe.cronSetup,
        name: `lumpcode-${recipe.daemonId}`,
        logger,
        runTick,
        shouldStop: () => shouldDrainDaemon(desiredFilePath),
        onNextTickAtChange: (iso) => liveMeta.setNextTickAt(iso),
    });
    if (!schedulerResult.success) {
        await removeOwnPidArtifacts({
            pidFilePath,
            extraFilePaths: [metaFilePath, desiredFilePath],
        });
        return failure({ messages: [schedulerResult.data] });
    }
    const scheduler = schedulerResult.data;

    shutdown = installProcessShutdown({
        logger,
        signalMessage: (signal) => `signal ${signal}; shutting down`,
        onSignal: async () => {
            await markStartDaemonDesiredStopping({ desiredFilePath });
            abortAllDaemonLumpRuns();
        },
        waitForShutdownOverride,
    });

    logger.info(
        `Lumpcode daemon id="${recipe.daemonId}" on ${recipe.cronSetup}. First run now, then on schedule. Press Ctrl+C to stop.`,
    );

    const disposeGuards = installDaemonProcessGuards({ logger });
    try {
        await scheduler.start();
        await shutdown.promise;

        const draining = await shouldDrainDaemon(desiredFilePath);
        await removeOwnPidArtifacts({
            pidFilePath,
            extraFilePaths: draining ? [metaFilePath, desiredFilePath] : [metaFilePath],
        });
    } finally {
        scheduler.stop();
        shutdown.dispose();
        disposeGuards();
    }

    return success({
        messages: [`Stopped after ${ticks} run(s).`, `Schedule was: ${recipe.cronSetup}`],
        data: {
            cronSetup: recipe.cronSetup,
            lumpNames: initialLumps,
            ticks,
            daemonId: recipe.daemonId,
            include: recipe.include,
            exclude: recipe.exclude,
            maxParallelRun: recipe.maxParallelRun,
        },
    });
}
