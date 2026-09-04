import { Cron } from 'croner';

import type { Failure, Logger, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import { applyLumpConfigDefaults } from '../applyLumpConfigDefaults';
import { claimPidAndWriteMeta, removeOwnPidArtifacts } from '../claimPidAndWriteMeta';
import { createCliLogger } from '../createCliLogger';
import { discoverDedicatedLumpsForScanBranch } from '../discoverDedicatedLumpsForScanBranch';
import { discoverLoadableLumps } from '../discoverLoadableLumpNames';
import { expandPrimaryBranches } from '../expandPrimaryBranches';
import { filterLumpNames } from '../filterLumpNames';
import { getJsConfigFromLumpName } from '../getJsConfigFromLumpName';
import { installDaemonProcessGuards } from '../installDaemonProcessGuards';
import { installProcessShutdown } from '../installProcessShutdown';
import type { LumpLine } from '../lumpLine';
import type { DaemonMetaWrite } from '../readDaemonMeta';
import { reorderDedicatedLumpLines } from '../reorderDedicatedLumpLines';
import { resolvePrimaryBranches } from '../resolvePrimaryBranches';
import { runLumpFromJsConfigFailureMessage } from '../runLumpFromJsConfig';
import { runLumpFromLumpName } from '../runLumpFromLumpName';
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
import { writeJsonFile } from '../writeJsonFile';

async function shouldDrainDaemon(desiredFilePath: string): Promise<boolean> {
    const desiredResult = await readStartDaemonDesired(desiredFilePath);
    return desiredResult.success && desiredResult.data?.stopping === true;
}

/** Serializes meta writes so parallel ticks do not lose increments. */
function createInFlightMetaUpdater(
    metaFilePath: string,
    logger: Logger,
    baseMeta: DaemonMetaWrite,
): {
    adjust: (delta: 1 | -1) => Promise<void>;
} {
    let chain: Promise<void> = Promise.resolve();
    let count = 0;

    const adjust = (delta: 1 | -1): Promise<void> => {
        const run = async () => {
            count = Math.max(0, count + delta);
            const writeResult = await writeJsonFile({
                filePath: metaFilePath,
                data: { ...baseMeta, inFlightLumpCount: count },
                trailingNewline: true,
            });
            if (!writeResult.success) {
                logger.error(`Could not write inFlightLumpCount: ${writeResult.data}`);
                throw new Error(writeResult.data);
            }
        };
        const next = chain.then(run, run);
        chain = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    };

    return { adjust };
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
    inFlightMeta: { adjust: (delta: 1 | -1) => Promise<void> };
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

async function runLumpLine(
    session: TickSession,
    lumpLine: LumpLine,
): Promise<void> {
    const { lumpName } = lumpLine;
    const abortController = new AbortController();
    session.daemonLumpAbortControllers.add(abortController);
    await session.inFlightMeta.adjust(1);
    try {
        const jsConfForVerbose = await getJsConfigFromLumpName({
            lumpName,
            localConfigFolderPath: session.localConfigFolderPath,
        });
        const effectiveForVerbose = jsConfForVerbose.success
            ? applyLumpConfigDefaults({
                  jsConfig: jsConfForVerbose.data,
                  resolved: session.frozenLocalConfig,
              })
            : undefined;
        const lumpLogger = createCliLogger({
            verbose: !!session.cliVerbose || !!effectiveForVerbose?.verbose,
            json: !!session.json,
            prefix: '[lumpcode start]',
        });
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
        });
        if (!runLumpRes.success) {
            session.logger.error(
                `lump "${lumpName}": ${runLumpFromJsConfigFailureMessage(runLumpRes.data)}`,
            );
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
        await session.inFlightMeta.adjust(-1);
    }
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

    const foregroundMeta: DaemonMetaWrite = {
        ...toMetaWrite(recipe),
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

    const shutdown = installProcessShutdown({
        logger,
        signalMessage: (signal) => `signal ${signal}; shutting down`,
        onSignal: async () => {
            await markStartDaemonDesiredStopping({ desiredFilePath });
            abortAllDaemonLumpRuns();
        },
        waitForShutdownOverride,
    });

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
        inFlightMeta: createInFlightMetaUpdater(metaFilePath, logger, foregroundMeta),
        daemonLumpAbortControllers,
        warnings: { sharedMultiDiscovery: false, checkoutParallelism: false },
    };

    let ticks = 0;
    const runTick = async (): Promise<void> => {
        logger.info(`${new Date().toISOString()} - runTick`);
        if (await shouldDrainDaemon(desiredFilePath)) {
            logger.info('desired.json is stopping; draining and skipping tick.');
            shutdown.shutdown();
            return;
        }
        try {
            const collected = await collectTickLumpLines(session);
            switch (collected.kind) {
                case 'noop':
                    break;
                case 'expand-failed':
                    ticks += 1;
                    break;
                case 'run': {
                    ticks += 1;
                    const label =
                        frozenLocalConfig.mode === 'dedicated'
                            ? collected.items
                                  .map((e) => `${e.lumpName}@${e.effectiveDiscoveryBranch}`)
                                  .join(', ')
                            : collected.items.map((e) => e.lumpName).join(', ');
                    logger.info(
                        `tick ${ticks} — running ${collected.items.length} lump(s)…` +
                            (collected.items.length ? ` [${label}]` : ''),
                    );
                    if (collected.items.length === 0) {
                        break;
                    }
                    await runLumpLinesWithConcurrency({
                        items: collected.items,
                        concurrency: effectiveConcurrency,
                        runLumpLine: (line) => runLumpLine(session, line),
                    });
                    break;
                }
                default: {
                    const _exhaustive: never = collected;
                    return _exhaustive;
                }
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.error(`tick failed: ${msg}`);
        } finally {
            if (await shouldDrainDaemon(desiredFilePath)) {
                shutdown.shutdown();
            }
        }
    };

    logger.info(
        `Lumpcode daemon id="${recipe.daemonId}" on ${recipe.cronSetup}. First run now, then on schedule. Press Ctrl+C to stop.`,
    );

    const disposeGuards = installDaemonProcessGuards({ logger });
    let cronJob: Cron | undefined;
    try {
        await runTick();

        try {
            cronJob = new Cron(
                recipe.cronSetup,
                { protect: true, name: `lumpcode-${recipe.daemonId}` },
                async () => {
                    await runTick();
                },
            );
        } catch (e) {
            await removeOwnPidArtifacts({
                pidFilePath,
                extraFilePaths: [metaFilePath, desiredFilePath],
            });
            const msg = e instanceof Error ? e.message : String(e);
            return failure({
                messages: [`Failed to start scheduler for "${recipe.cronSetup}": ${msg}`],
            });
        }

        await shutdown.promise;
        cronJob?.stop();

        const draining = await shouldDrainDaemon(desiredFilePath);
        await removeOwnPidArtifacts({
            pidFilePath,
            extraFilePaths: draining ? [metaFilePath, desiredFilePath] : [metaFilePath],
        });
    } finally {
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
