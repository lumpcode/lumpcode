import * as fs from 'node:fs/promises';
import { spawn as nodeSpawn } from 'node:child_process';
import { isSea } from 'node:sea';
import * as z from 'zod';
import { Cron, CronPattern } from 'croner';

import type { Failure, Logger, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    applyLumpConfigDefaults,
    assertDaemonStartAllowed,
    commandFailure,
    createCliLogger,
    discoverDedicatedLumpsForScanBranch,
    discoverLoadableLumps,
    expandPrimaryBranches,
    filterLumpNames,
    isLumpNameFilterActive,
    listRunningProjectDaemons,
    parseLumpNameFilterPatterns,
    readProjectLocalConfig,
    resolveDaemonId,
    resolvePrimaryBranches,
    runLumpFromJsConfigFailureMessage,
    runLumpFromLumpName,
    runLumpQueueWithConcurrency,
    validateDaemonLaunch,
    type LumpNameFilter,
} from '../../utils';
import { RESERVED_DAEMON_ID } from '../../utils/daemonFileBaseName';
import { resolveDaemonPaths } from '../../utils/resolveDaemonPaths';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';
import { getJsConfigFromLumpName } from '../../utils/getJsConfigFromLumpName';
import type { DaemonMetaWrite } from '../../utils/readDaemonMeta';
import { readDaemonMeta } from '../../utils/readDaemonMeta';

/** Default detached-daemon schedule; used by `start` and `restart`. */
export const defaultCronPattern = '*/5 * * * *';

const LUMP_NAME_START_DEPRECATION =
    '--lumpName is deprecated on start; use --include=<name> (and optional --daemonId) instead.';

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
        include: z
            .string()
            .optional()
            .describe('Comma-separated lump name patterns to include (exact or * globs)'),
        exclude: z
            .string()
            .optional()
            .describe('Comma-separated lump name patterns to exclude after include'),
        daemonId: z.string().optional().describe('Unique daemon id for PID/log/meta files'),
        maxParallelRun: z
            .number()
            .optional()
            .describe('Override local.json maxParallelRun for this worktree daemon'),
        lumpName: z
            .string()
            .optional()
            .describe('Deprecated: equivalent to --include=<name>'),
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
        daemonId: string;
        include?: string[];
        exclude?: string[];
        maxParallelRun?: number;
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
    baseMeta: DaemonMetaWrite,
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
                daemonId: current.daemonId ?? baseMeta.daemonId,
                cronSetup: current.cronSetup ?? baseMeta.cronSetup,
                workspaceStrategy: current.workspaceStrategy,
                inFlightLumpCount: next,
                ...(current.maxParallelRun !== undefined
                    ? { maxParallelRun: current.maxParallelRun }
                    : baseMeta.maxParallelRun !== undefined
                      ? { maxParallelRun: baseMeta.maxParallelRun }
                      : {}),
                ...(current.include !== undefined
                    ? { include: current.include }
                    : baseMeta.include !== undefined
                      ? { include: baseMeta.include }
                      : {}),
                ...(current.exclude !== undefined
                    ? { exclude: current.exclude }
                    : baseMeta.exclude !== undefined
                      ? { exclude: baseMeta.exclude }
                      : {}),
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

function pushCsvOption(spawnArgs: string[], flag: string, values: string[]): void {
    if (values.length > 0) {
        spawnArgs.push(flag, values.join(','));
    }
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath, waitForShutdownOverride, spawnFn } =
        injections;
    const { json, verbose: cliVerbose } = input.options;
    const foreground = input.options.foreground === true;
    const cronSetup = input.options.cronSetup?.trim() || defaultCronPattern;
    const lumpNameOpt = input.options.lumpName?.trim() ? input.options.lumpName.trim() : undefined;
    const explicitDaemonId = input.options.daemonId?.trim() || undefined;
    const cliMaxParallelRun = input.options.maxParallelRun;
    const spawnImpl = spawnFn ?? nodeSpawn;
    const logger = createCliLogger({
        verbose: !!cliVerbose,
        json: !!json,
        prefix: '[lumpcode start]',
    });

    const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
    if (!validationResult.success) return commandFailure(validationResult.data);

    const localConfigResult = await readProjectLocalConfig({ localConfigFolderPath });
    if (!localConfigResult.success) return commandFailure(localConfigResult.data);
    const frozenLocalConfig: ResolvedProjectLocalConfig = localConfigResult.data;
    const workspaceStrategy = frozenLocalConfig.workspaceStrategy;
    const effectivePrimaryBranches = resolvePrimaryBranches(frozenLocalConfig);

    if (lumpNameOpt && input.options.include !== undefined && input.options.include.trim() !== '') {
        return failure({
            messages: ['Pass only one of --lumpName and --include.'],
        });
    }
    if (lumpNameOpt) {
        logger.warn(LUMP_NAME_START_DEPRECATION);
    }

    const include = lumpNameOpt
        ? [lumpNameOpt]
        : parseLumpNameFilterPatterns(input.options.include);
    const exclude = parseLumpNameFilterPatterns(input.options.exclude);
    const filter: LumpNameFilter = {
        ...(include.length ? { include } : {}),
        ...(exclude.length ? { exclude } : {}),
    };

    if (cliMaxParallelRun !== undefined) {
        if (!Number.isInteger(cliMaxParallelRun) || cliMaxParallelRun < 1) {
            return failure({
                messages: ['--maxParallelRun must be a positive integer.'],
            });
        }
        if (workspaceStrategy === 'checkout') {
            return failure({
                messages: [
                    '--maxParallelRun requires workspaceStrategy "worktree" in local.json.',
                ],
            });
        }
    }

    try {
        new CronPattern(cronSetup);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return failure({
            messages: [`Invalid cron expression "${cronSetup}": ${msg}`],
        });
    }

    const namePathsProbe = await resolveDaemonPaths({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        daemonId: RESERVED_DAEMON_ID,
    });
    if (!namePathsProbe.success) return commandFailure(namePathsProbe.data);
    const { daemonsDir, projectName } = namePathsProbe.data;

    const runningResult = await listRunningProjectDaemons({ daemonsDir, projectName });
    if (!runningResult.success) {
        return failure({ messages: [runningResult.data] });
    }
    const existingDaemonIds = new Set(Object.keys(runningResult.data));

    const daemonIdResult = resolveDaemonId({
        explicitDaemonId,
        filter,
        existingDaemonIds,
    });
    if (!daemonIdResult.success) {
        return failure({ messages: [daemonIdResult.data] });
    }
    const daemonId = daemonIdResult.data;

    const startAllowed = assertDaemonStartAllowed({
        projectName,
        daemonId,
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

    const daemonPathsResult = await resolveDaemonPaths({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        daemonId,
    });
    if (!daemonPathsResult.success) return commandFailure(daemonPathsResult.data);
    const { pidFilePath, logFilePath, metaFilePath } = daemonPathsResult.data;

    const configuredMaxParallelRun = frozenLocalConfig.maxParallelRun ?? 1;
    const effectiveConcurrency =
        workspaceStrategy === 'worktree'
            ? (cliMaxParallelRun ?? configuredMaxParallelRun)
            : 1;

    const loadableAtStart = await discoverLoadableLumps({ localConfigFolderPath, logger });
    const initialLumps = filterLumpNames({
        names: loadableAtStart.map((l) => l.lumpName),
        include: filter.include,
        exclude: filter.exclude,
    });
    if (isLumpNameFilterActive(filter) && initialLumps.length === 0) {
        logger.warn(
            'No lumps matched include/exclude at start; daemon will idle until a match appears.',
        );
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
        spawnArgs.push('start', '--foreground', '--cronSetup', cronSetup, '--daemonId', daemonId);
        pushCsvOption(spawnArgs, '--include', include);
        pushCsvOption(spawnArgs, '--exclude', exclude);
        if (cliMaxParallelRun !== undefined) {
            spawnArgs.push('--maxParallelRun', String(cliMaxParallelRun));
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

        const stopHint =
            daemonId === RESERVED_DAEMON_ID
                ? '`lumpcode stop`'
                : `\`lumpcode stop --daemonId ${daemonId}\``;
        const filterDesc = isLumpNameFilterActive(filter)
            ? `Filter: include=${include.join(',') || '*'} exclude=${exclude.join(',') || '(none)'}.`
            : 'Filter: all loadable lumps.';

        return success({
            messages: [
                `Lumpcode daemon started. daemonId="${daemonId}". PID file: ${pidFilePath}. Logs: ${logFilePath}.`,
                `Project: "${projectName}". ${filterDesc} Run ${stopHint} to stop.`,
            ],
            data: {
                cronSetup,
                lumpNames: initialLumps,
                ticks: 0,
                daemonId,
                ...(include.length ? { include } : {}),
                ...(exclude.length ? { exclude } : {}),
                ...(cliMaxParallelRun !== undefined ? { maxParallelRun: cliMaxParallelRun } : {}),
            },
        });
    }

    const metaPayload: DaemonMetaWrite = {
        daemonId,
        cronSetup,
        workspaceStrategy,
        ...(include.length ? { include } : {}),
        ...(exclude.length ? { exclude } : {}),
        ...(effectiveConcurrency > 1 || cliMaxParallelRun !== undefined
            ? { maxParallelRun: effectiveConcurrency }
            : {}),
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
    const inFlightMeta = createInFlightMetaUpdater(metaFilePath, logger, metaPayload);

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
            workspaceStrategy !== 'worktree' &&
            configuredMaxParallelRun > 1 &&
            !checkoutParallelismWarningLogged
        ) {
            logger.info(
                'maxParallelRun > 1 requires workspaceStrategy "worktree"; running lumps sequentially.',
            );
            checkoutParallelismWarningLogged = true;
        }

        const runOneLump = async (input: {
            lumpName: string;
            effectiveDiscoveryBranch?: string;
        }): Promise<void> => {
            const { lumpName } = input;

            await inFlightMeta.adjust(1);
            const abortController = new AbortController();
            daemonLumpAbortControllers.add(abortController);
            try {
                const jsConfForVerbose = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
                const effectiveForVerbose = jsConfForVerbose.success
                    ? applyLumpConfigDefaults({
                          jsConfig: jsConfForVerbose.data,
                          resolved: frozenLocalConfig,
                      })
                    : undefined;
                const lumpLogger = createCliLogger({
                    verbose: !!cliVerbose || !!effectiveForVerbose?.verbose,
                    json: !!json,
                    prefix: '[lumpcode start]',
                });
                const runLumpRes = await runLumpFromLumpName({
                    lumpName,
                    localConfigFolderPath,
                    globalConfigFolderPath,
                    sourceProjectRoot: projectRoot,
                    lockMode: 'wait',
                    projectName,
                    localConfig: frozenLocalConfig,
                    logger: lumpLogger,
                    effectiveDiscoveryBranch: input.effectiveDiscoveryBranch,
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

        if (frozenLocalConfig.mode === 'dedicated') {
            ticks += 1;
            const expandResult = await expandPrimaryBranches({
                localConfig: frozenLocalConfig,
                cwd: projectRoot,
                logger,
            });
            if (!expandResult.success) {
                logger.error(`primaryBranches expand failed: ${expandResult.data}; skipping tick`);
                return;
            }
            const scanBranches = expandResult.data;

            const eligible: Array<{ lumpName: string; effectiveDiscoveryBranch: string }> = [];
            const seenOnScan = new Set<string>();

            for (const scanBranch of scanBranches) {
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
                const discoveredNames = discoverResult.data.map((l) => l.lumpName);
                const matched = new Set(
                    filterLumpNames({
                        names: discoveredNames,
                        include: filter.include,
                        exclude: filter.exclude,
                    }),
                );
                for (const { lumpName } of discoverResult.data) {
                    if (!matched.has(lumpName)) continue;
                    const seenKey = `${lumpName}\0${scanBranch}`;
                    if (seenOnScan.has(seenKey)) {
                        logger.warn(`duplicate lump "${lumpName}" on branch "${scanBranch}"; skipping`);
                        continue;
                    }
                    seenOnScan.add(seenKey);
                    eligible.push({ lumpName, effectiveDiscoveryBranch: scanBranch });
                }
            }

            logger.info(
                `tick ${ticks} — running ${eligible.length} lump(s)…` +
                    (eligible.length
                        ? ` [${eligible.map((e) => `${e.lumpName}@${e.effectiveDiscoveryBranch}`).join(', ')}]`
                        : ''),
            );
            if (eligible.length === 0) {
                return;
            }
            await runLumpQueueWithConcurrency({
                items: eligible,
                concurrency: effectiveConcurrency,
                runOneLump,
            });
            return;
        }

        const loadable = await discoverLoadableLumps({ localConfigFolderPath, logger });
        const names = filterLumpNames({
            names: loadable.map((lump) => lump.lumpName),
            include: filter.include,
            exclude: filter.exclude,
        });
        if (names.length === 0) {
            logger.warn('no lumps matched filter this tick; skipping.');
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

    logger.info(
        `Lumpcode daemon id="${daemonId}" on ${cronSetup}. First run now, then on schedule. Press Ctrl+C to stop.`,
    );

    const launchValidation = await validateDaemonLaunch({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        localConfig: frozenLocalConfig,
        logger,
    });
    if (!launchValidation.success) {
        await tryRemoveOwnDaemonArtifacts(pidFilePath, metaFilePath);
        return failure({ messages: [launchValidation.data] });
    }

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
                { protect: true, name: `lumpcode-${daemonId}` },
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
            daemonId,
            ...(include.length ? { include } : {}),
            ...(exclude.length ? { exclude } : {}),
            ...(cliMaxParallelRun !== undefined ? { maxParallelRun: cliMaxParallelRun } : {}),
        },
    });
};

export const command = {
    handlerMaker,
    name: 'start',
    description:
        'Detach a background scheduler that re-runs lumps on a cron schedule (PID under ~/.lumpcode/daemons/). Pass `--foreground` to run blocking in this terminal. Pass `--include` / `--exclude` to filter lumps and `--daemonId` to name the daemon.',
    inputSchema,
} satisfies Command;
