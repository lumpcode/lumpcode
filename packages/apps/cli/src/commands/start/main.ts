import * as fs from 'node:fs/promises';
import { spawn as nodeSpawn } from 'node:child_process';
import { isSea } from 'node:sea';
import * as z from 'zod';
import { Cron, CronPattern } from 'croner';

import type { Failure, Logger, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import type { LocalConfig } from '../../types/LocalConfig';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    assertDaemonStartAllowed,
    commandFailure,
    createCliLogger,
    discoverDedicatedLumpsForScanBranch,
    discoverLoadableLumps,
    formatDeamonLumpScopeCliOutput,
    listRunningProjectDaemons,
    readLocalConfig,
    resolveEffectiveDiscoveryBranch,
    resolvePrimaryBranches,
    resolveTargetLumpNames,
    runLumpFromJsConfigFailureMessage,
    runLumpFromLumpName,
    runLumpQueueWithConcurrency,
    validateDaemonLaunch,
} from '../../utils';
import { resolveDaemonPaths } from '../../utils/resolveDaemonPaths';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';
import { getJsConfigFromLumpName } from '../../utils/getJsConfigFromLumpName';
import type { DaemonMetaWrite } from '../../utils/readDaemonMeta';
import { readDaemonMeta } from '../../utils/readDaemonMeta';

/** Default detached-daemon schedule; used by `start` and `restart`. */
export const defaultCronPattern = '*/5 * * * *';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        cronSetup: z
            .string()
            .optional()
            .describe(`Cron schedule (default "${defaultCronPattern}" — every 5 minutes)`),
        foreground: z
            .boolean()
            .optional()
            .describe('Run blocking in this terminal (omit to detach a background daemon)'),
        lumpName: z.string().optional().describe('Run the scheduler for a single lump only'),
        discoveryBranch: z
            .string()
            .optional()
            .describe(
                'Discovery branch override for solo daemon (dedicated; must be listed in primaryBranches)',
            ),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: {
        cronSetup: string;
        lumpNames: string[];
        ticks: number;
        lumpName?: string;
    };
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    /** When set (e.g. in tests), used instead of waiting for SIGINT/SIGTERM */
    waitForShutdownOverride?: () => Promise<void>;
    /** When set (e.g. in tests), used instead of `child_process.spawn` */
    spawnFn?: typeof nodeSpawn;
}

/** In-flight lump AbortControllers; aborted on SIGINT/SIGTERM during a tick. */
const daemonLumpAbortControllers = new Set<AbortController>();

function abortAllDaemonLumpRuns(): void {
    for (const controller of daemonLumpAbortControllers) {
        controller.abort();
    }
}

const waitForShutdown: () => Promise<void> = () =>
    new Promise((resolve) => {
        const onSignal = () => {
            abortAllDaemonLumpRuns();
            process.off('SIGINT', onSignal);
            process.off('SIGTERM', onSignal);
            resolve();
        };
        process.on('SIGINT', onSignal);
        process.on('SIGTERM', onSignal);
    });

async function writeDaemonArtifacts(input: {
    daemonsDir: string;
    pidFilePath: string;
    metaFilePath: string;
    metaPayload: DaemonMetaWrite;
}): Promise<Success<void> | Failure<{ messages: string[] }>> {
    const { daemonsDir, pidFilePath, metaFilePath, metaPayload } = input;
    await fs.mkdir(daemonsDir, { recursive: true });
    try {
        await fs.writeFile(pidFilePath, String(process.pid), 'utf8');
        await fs.writeFile(metaFilePath, `${JSON.stringify(metaPayload)}\n`, 'utf8');
    } catch (e) {
        await fs.unlink(pidFilePath).catch(() => {});
        const msg = e instanceof Error ? e.message : String(e);
        return failure({
            messages: [`Could not write daemon artifacts: ${msg}`],
        });
    }
    return success(undefined);
}

async function tryRemoveOwnDaemonArtifacts(pidFilePath: string, metaFilePath: string): Promise<void> {
    try {
        const raw = await fs.readFile(pidFilePath, 'utf8');
        const filePid = Number.parseInt(raw.trim(), 10);
        if (Number.isNaN(filePid) || filePid !== process.pid) {
            return;
        }
        await fs.unlink(pidFilePath);
        await fs.unlink(metaFilePath).catch(() => {});
    } catch {
        // missing or unreadable file — ignore
    }
}

/** Serializes meta read-modify-write so parallel ticks do not lose increments. */
function createInFlightMetaUpdater(
    metaFilePath: string,
    logger: Logger,
): {
    adjust: (delta: 1 | -1) => Promise<void>;
} {
    let chain: Promise<void> = Promise.resolve();

    const adjust = (delta: 1 | -1): Promise<void> => {
        const run = async () => {
            const metaResult = await readDaemonMeta(metaFilePath);
            if (!metaResult.success) {
                logger.warn(
                    `Skipping inFlightLumpCount update: daemon meta is invalid (reason: ${metaResult.data.reason}) at ${metaFilePath}`,
                );
                return;
            }
            const current = metaResult.data;
            const next = Math.max(0, (current.inFlightLumpCount ?? 0) + delta);
            const payload: Record<string, unknown> = {
                ...(current.cronSetup !== undefined ? { cronSetup: current.cronSetup } : {}),
                workspaceStrategy: current.workspaceStrategy,
                ...(current.lumpName !== undefined ? { lumpName: current.lumpName } : {}),
                inFlightLumpCount: next,
            };
            await fs.writeFile(metaFilePath, `${JSON.stringify(payload)}\n`, 'utf8');
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

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath, waitForShutdownOverride, spawnFn } =
        injections;
    const { json, verbose: cliVerbose } = input.options;
    const foreground = input.options.foreground === true;
    const cronSetup = input.options.cronSetup?.trim() || defaultCronPattern;
    const lumpNameOpt = input.options.lumpName?.trim() ? input.options.lumpName.trim() : undefined;
    const discoveryBranchOpt = input.options.discoveryBranch?.trim() || undefined;
    const spawnImpl = spawnFn ?? nodeSpawn;
    const logger = createCliLogger({
        verbose: !!cliVerbose,
        json: !!json,
        prefix: '[lumpcode start]',
    });

    const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
    if (!validationResult.success) return commandFailure(validationResult.data);

    const localConfigResult = await readLocalConfig({ localConfigFolderPath });
    if (!localConfigResult.success) return commandFailure(localConfigResult.data);
    const frozenLocalConfig: LocalConfig = localConfigResult.data;
    const workspaceStrategy = frozenLocalConfig.workspaceStrategy ?? 'checkout';
    const effectivePrimaryBranches = resolvePrimaryBranches(frozenLocalConfig);

    const targetLumpsResult = await resolveTargetLumpNames({
        localConfigFolderPath,
        lumpName: lumpNameOpt,
    });
    let initialLumps: string[];
    if (!targetLumpsResult.success) {
        const allowEmptyDedicatedDiscovery =
            !lumpNameOpt &&
            frozenLocalConfig.mode === 'dedicated' &&
            (frozenLocalConfig.primaryBranches?.length ?? 0) > 1 &&
            targetLumpsResult.data.includes('No lumps');
        if (!allowEmptyDedicatedDiscovery) {
            return failure({ messages: [targetLumpsResult.data] });
        }
        initialLumps = [];
    } else {
        initialLumps = targetLumpsResult.data;
    }

    try {
        new CronPattern(cronSetup);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return failure({
            messages: [`Invalid cron expression "${cronSetup}": ${msg}`],
        });
    }

    const daemonPathsResult = await resolveDaemonPaths({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        lumpName: lumpNameOpt,
    });
    if (!daemonPathsResult.success) return commandFailure(daemonPathsResult.data);

    const { daemonsDir, pidFilePath, logFilePath, metaFilePath, projectName } = daemonPathsResult.data;

    const runningResult = await listRunningProjectDaemons({ daemonsDir, projectName });
    if (!runningResult.success) {
        return failure({ messages: [runningResult.data] });
    }
    const startAllowed = assertDaemonStartAllowed({
        projectName,
        targetLumpName: lumpNameOpt,
        workspaceStrategy,
        running: runningResult.data,
    });

    if (!startAllowed.success) {
        return failure({
            messages: [startAllowed.data.message],
            ...(startAllowed.data.code !== undefined
                ? {
                      data: {
                          code: startAllowed.data.code,
                          ...(startAllowed.data.reason !== undefined
                              ? { reason: startAllowed.data.reason }
                              : {}),
                      },
                  }
                : {}),
        });
    }

    if (!foreground) {
        await fs.mkdir(daemonsDir, { recursive: true });

        const runningAsSeaBinary = (() => {
            try {
                return isSea();
            } catch {
                return false;
            }
        })();

        const spawnArgs: string[] = [];
        if (!runningAsSeaBinary) {
            const cliEntry = process.argv[1];
            if (!cliEntry) {
                return failure({
                    messages: ['Could not resolve CLI entry path (process.argv[1] is empty).'],
                });
            }
            spawnArgs.push(cliEntry);
        }
        spawnArgs.push('start', '--foreground', '--cronSetup', cronSetup);
        if (lumpNameOpt) {
            spawnArgs.push('--lumpName', lumpNameOpt);
        }
        if (discoveryBranchOpt) {
            spawnArgs.push('--discoveryBranch', discoveryBranchOpt);
        }
        if (json) {
            spawnArgs.push('--json');
        }
        if (cliVerbose) {
            spawnArgs.push('--verbose');
        }

        let logHandle: Awaited<ReturnType<typeof fs.open>>;
        try {
            logHandle = await fs.open(logFilePath, 'a');
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return failure({
                messages: [`Could not open daemon log file "${logFilePath}": ${msg}`],
            });
        }

        try {
            const child = spawnImpl(process.execPath, spawnArgs, {
                detached: true,
                stdio: ['ignore', logHandle.fd, logHandle.fd],
                cwd: projectRoot,
                windowsHide: true,
            });
            child.unref();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return failure({
                messages: [`Failed to start detached daemon: ${msg}`],
            });
        } finally {
            await logHandle.close();
        }

        const stopHint = lumpNameOpt
            ? `\`lumpcode stop --lumpName ${lumpNameOpt}\``
            : '`lumpcode stop`';
        const scopeLine = `${formatDeamonLumpScopeCliOutput({
            lumpName: lumpNameOpt,
            lumpNames: initialLumps,
            quoteLumpName: true,
        })}.`;

        return success({
            messages: [
                `Lumpcode daemon started. PID file: ${pidFilePath}. Logs: ${logFilePath}.`,
                `Project: "${projectName}". ${scopeLine} Run ${stopHint} to stop.`,
            ],
            data: {
                cronSetup,
                lumpNames: initialLumps,
                ticks: 0,
                ...(lumpNameOpt !== undefined ? { lumpName: lumpNameOpt } : {}),
            },
        });
    }

    const metaPayload: DaemonMetaWrite = {
        cronSetup,
        workspaceStrategy,
        ...(lumpNameOpt !== undefined ? { lumpName: lumpNameOpt } : {}),
    };

    const writeArtifactsResult = await writeDaemonArtifacts({
        daemonsDir,
        pidFilePath,
        metaFilePath,
        metaPayload,
    });
    if (!writeArtifactsResult.success) {
        return writeArtifactsResult;
    }

    let ticks = 0;
    let cronJob: Cron | undefined;
    const projectDisabled = frozenLocalConfig.disabled === true;
    let sharedMultiDiscoveryWarningLogged = false;
    let checkoutParallelismWarningLogged = false;
    const inFlightMeta = createInFlightMetaUpdater(metaFilePath, logger);
    const configuredMaxParallelRun = frozenLocalConfig.maxParallelRun ?? 1;
    const effectiveConcurrency =
        !lumpNameOpt && workspaceStrategy === 'worktree' ? configuredMaxParallelRun : 1;

    let frozenEffectiveDiscoveryBranch: string | undefined;
    if (lumpNameOpt) {
        const discoveryResult = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt,
            lumpName: lumpNameOpt,
            localConfigFolderPath,
            localConfig: frozenLocalConfig,
            logger,
            warnSharedDiscoveryBranchIgnored: true,
        });
        if (!discoveryResult.success) {
            await tryRemoveOwnDaemonArtifacts(pidFilePath, metaFilePath);
            return failure({ messages: [discoveryResult.data] });
        }
        frozenEffectiveDiscoveryBranch = discoveryResult.data;
    } else if (discoveryBranchOpt) {
        logger.info('--discoveryBranch has no effect on a global daemon; ignoring.');
    }

    if (projectDisabled) {
        logger.info('project disabled in local.json; skipping tick.');
    }

    const runTick: () => Promise<void> = async () => {
        logger.info(`${new Date().toISOString()} - runTick`);
        if (projectDisabled) {
            logger.info('- project disabled; skipping tick.');
            return;
        }

        if (
            frozenLocalConfig.mode === 'shared' &&
            effectivePrimaryBranches.length > 1 &&
            !sharedMultiDiscoveryWarningLogged
        ) {
            logger.info(
                'local.json lists multiple primary branches; multi-branch daemon scans are dedicated-only. ' +
                    'Using the primary branch for shared mode.',
            );
            sharedMultiDiscoveryWarningLogged = true;
        }

        if (
            !lumpNameOpt &&
            workspaceStrategy !== 'worktree' &&
            configuredMaxParallelRun > 1 &&
            !checkoutParallelismWarningLogged
        ) {
            logger.info(
                'maxParallelRun > 1 requires workspaceStrategy "worktree"; running lumps sequentially.',
            );
            checkoutParallelismWarningLogged = true;
        }

        // Populated during dedicated multi-branch discovery so queue runs can preflight
        // to the scan branch even when the lump config is absent on the current checkout.
        const discoveryBranchByLumpName = new Map<string, string>();

        const runOneLump = async (input: { lumpName: string }): Promise<void> => {
            const { lumpName } = input;

            await inFlightMeta.adjust(1);
            const abortController = new AbortController();
            daemonLumpAbortControllers.add(abortController);
            try {
                const jsConfForVerbose = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
                const lumpLogger = createCliLogger({
                    verbose:
                        !!cliVerbose ||
                        !!(jsConfForVerbose.success && jsConfForVerbose.data.verbose),
                    json: !!json,
                    prefix: '[lumpcode start]',
                });
                const queuedDiscoveryBranch = discoveryBranchByLumpName.get(lumpName);
                const runLumpRes = await runLumpFromLumpName({
                    lumpName,
                    localConfigFolderPath,
                    globalConfigFolderPath,
                    sourceProjectRoot: projectRoot,
                    lockMode: 'wait',
                    projectName,
                    localConfig: frozenLocalConfig,
                    logger: lumpLogger,
                    effectiveDiscoveryBranch:
                        lumpName === lumpNameOpt
                            ? frozenEffectiveDiscoveryBranch
                            : queuedDiscoveryBranch,
                    discoveryBranchOpt: lumpName === lumpNameOpt ? discoveryBranchOpt : undefined,
                    signal: abortController.signal,
                });
                if (!runLumpRes.success) {
                    logger.error(`lump "${lumpName}": ${runLumpFromJsConfigFailureMessage(runLumpRes.data)}`);
                } else if (runLumpRes.data.skipped) {
                    if (runLumpRes.data.reason === 'disabled') {
                        logger.info(`lump "${lumpName}": skipped (disabled)`);
                    } else {
                        logger.info(
                            `lump "${lumpName}" skipped: ${runLumpRes.data.reason} - ${runLumpRes.data.reasonDetail}`,
                        );
                    }
                } else {
                    const contextNames = runLumpRes.data.result.contextNames;
                    logger.info(
                        `lump "${lumpName}": ok (contexts: ${contextNames.join(', ') || 'none'})`,
                    );
                }
            } finally {
                daemonLumpAbortControllers.delete(abortController);
                await inFlightMeta.adjust(-1);
            }
        };

        if (lumpNameOpt) {
            ticks += 1;
            logger.info(`tick ${ticks} — running lump "${lumpNameOpt}"…`);
            await runOneLump({ lumpName: lumpNameOpt });
            return;
        }

        if (frozenLocalConfig.mode === 'dedicated') {
            ticks += 1;
            const seen = new Set<string>();
            const eligible: string[] = [];
            discoveryBranchByLumpName.clear();

            for (const scanBranch of effectivePrimaryBranches) {
                const discoverResult = await discoverDedicatedLumpsForScanBranch({
                    scanBranch,
                    sourceProjectRoot: projectRoot,
                    localConfigFolderPath,
                    globalConfigFolderPath,
                    localConfig: frozenLocalConfig,
                    logger,
                });
                if (!discoverResult.success) {
                    logger.error(`discovery branch "${scanBranch}": ${discoverResult.data}; skipping`);
                    continue;
                }
                for (const { lumpName, jsConfig } of discoverResult.data) {
                    if (seen.has(lumpName)) {
                        logger.warn(`duplicate lump "${lumpName}" on branch "${scanBranch}"; skipping`);
                        continue;
                    }
                    seen.add(lumpName);
                    if (jsConfig.ignoredByGlobalDaemon === true) {
                        continue;
                    }
                    eligible.push(lumpName);
                    discoveryBranchByLumpName.set(lumpName, scanBranch);
                }
            }

            logger.info(
                `tick ${ticks} — running ${eligible.length} lump(s)…` +
                    (eligible.length ? ` [${eligible.join(', ')}]` : ''),
            );
            await runLumpQueueWithConcurrency({
                lumpNames: eligible,
                concurrency: effectiveConcurrency,
                runOneLump,
            });
            return;
        }

        const loadable = await discoverLoadableLumps({ localConfigFolderPath, logger });
        const names = loadable
            .filter((lump) => lump.jsConfig.ignoredByGlobalDaemon !== true)
            .map((lump) => lump.lumpName);
        if (names.length === 0) {
            logger.warn('no lumps found this tick; skipping.');
            return;
        }

        ticks += 1;
        logger.info(`tick ${ticks} — running ${names.length} lump(s)… [${names.join(', ')}]`);
        await runLumpQueueWithConcurrency({
            lumpNames: names,
            concurrency: effectiveConcurrency,
            runOneLump,
        });
    };

    const scopeLabel = formatDeamonLumpScopeCliOutput({
        lumpName: lumpNameOpt,
        lumpNames: initialLumps,
    });
    logger.info(
        `Lumpcode daemon on ${cronSetup}. ${scopeLabel}. First run now, then on schedule. Press Ctrl+C to stop.`,
    );

    const launchValidation = await validateDaemonLaunch({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        localConfig: frozenLocalConfig,
        lumpNameOpt,
        effectiveDiscoveryBranch: frozenEffectiveDiscoveryBranch,
        discoveryBranchOpt,
        logger,
    });
    if (!launchValidation.success) {
        await tryRemoveOwnDaemonArtifacts(pidFilePath, metaFilePath);
        return failure({ messages: [launchValidation.data] });
    }

    if (!lumpNameOpt) {
        const loadableAtStart = await discoverLoadableLumps({ localConfigFolderPath, logger });
        const ignoredNames = loadableAtStart
            .filter((lump) => lump.jsConfig.ignoredByGlobalDaemon === true)
            .map((lump) => lump.lumpName);
        if (ignoredNames.length > 0) {
            logger.info(`Global daemon ignoring lump(s): ${ignoredNames.join(', ')}`);
        }
    }

    // Arm native SIGINT/SIGTERM shutdown *before* the first tick so a stop during runTick
    // both aborts work and resolves shutdown — otherwise only abort runs, then the daemon
    // hangs forever waiting for a second signal. Test overrides still run after the tick
    // (they assert post-tick artifacts and must not race in-flight meta writes).
    const onDaemonAbortSignal = () => {
        abortAllDaemonLumpRuns();
    };
    const nativeShutdownPromise = waitForShutdownOverride ? undefined : waitForShutdown();
    if (waitForShutdownOverride) {
        process.on('SIGINT', onDaemonAbortSignal);
        process.on('SIGTERM', onDaemonAbortSignal);
    }

    try {
        await runTick();

        try {
            cronJob = new Cron(
                cronSetup,
                { protect: true, name: 'lumpcode' + (lumpNameOpt ? '-' + lumpNameOpt : '') },
                async () => {
                    try {
                        await runTick();
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        logger.error(`tick failed: ${msg}`);
                    }
                },
            );
        } catch (e) {
            await tryRemoveOwnDaemonArtifacts(pidFilePath, metaFilePath);
            const msg = e instanceof Error ? e.message : String(e);
            return failure({
                messages: [`Failed to start scheduler for "${cronSetup}": ${msg}`],
            });
        }

        await (waitForShutdownOverride ?? (() => nativeShutdownPromise!))();
        cronJob?.stop();

        await tryRemoveOwnDaemonArtifacts(pidFilePath, metaFilePath);
    } finally {
        if (waitForShutdownOverride) {
            process.off('SIGINT', onDaemonAbortSignal);
            process.off('SIGTERM', onDaemonAbortSignal);
        }
    }

    const summaryLines = [`Stopped after ${ticks} run(s).`, `Schedule was: ${cronSetup}`];

    return success({
        messages: summaryLines,
        data: {
            cronSetup,
            lumpNames: initialLumps,
            ticks,
            ...(lumpNameOpt !== undefined ? { lumpName: lumpNameOpt } : {}),
        },
    });
};

export const command = {
    handlerMaker,
    name: 'start',
    description:
        'Detach a background scheduler that re-runs lumps on a cron schedule (PID under ~/.lumpcode/daemons/). Pass `--foreground` to run blocking in this terminal. Pass `--lumpName` to scope the daemon to one lump. You can invoke multiple daemons per-lump, but only one global.',
    inputSchema,
} satisfies Command;
