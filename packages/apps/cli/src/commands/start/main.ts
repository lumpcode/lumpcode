import * as fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
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
    expandPrimaryBranches,
    filterLumpNames,
    listRunningProjectDaemons,
    readLocalConfig,
    resolveDaemonId,
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
        include: z
            .string()
            .optional()
            .describe('Comma-separated exact names and *-globs (omit = all loadable before exclude)'),
        exclude: z
            .string()
            .optional()
            .describe('Comma-separated exact names and *-globs applied after include'),
        daemonId: z
            .string()
            .optional()
            .describe('Explicit daemon id ([a-zA-Z0-9_-]+); owns PID/log/meta paths'),
        maxParallelRun: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
                'Worktree-only override of local.json maxParallelRun for this daemon',
            ),
        lumpName: z
            .string()
            .optional()
            .describe('Deprecated. Equivalent to --include=<name>'),
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

function normalizePatternList(value: string | string[] | undefined): string[] | undefined {
    if (value === undefined) return undefined;
    const parts = (Array.isArray(value) ? value : [value]).flatMap((entry) =>
        String(entry)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    );
    return parts.length > 0 ? parts : undefined;
}

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
                ...(current.cronSetup !== undefined
                    ? { cronSetup: current.cronSetup }
                    : { cronSetup: baseMeta.cronSetup }),
                workspaceStrategy: current.workspaceStrategy,
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
                ...(current.maxParallelRun !== undefined
                    ? { maxParallelRun: current.maxParallelRun }
                    : baseMeta.maxParallelRun !== undefined
                      ? { maxParallelRun: baseMeta.maxParallelRun }
                      : {}),
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

function pushCsvFlag(args: string[], flag: string, values: string[] | undefined): void {
    if (!values?.length) return;
    // Commander option is a single string; comma-join so the child re-parses the full list.
    args.push(flag, values.join(','));
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

    const includeFromFlags = normalizePatternList(input.options.include);
    const exclude = normalizePatternList(input.options.exclude);

    if (lumpNameOpt !== undefined && includeFromFlags !== undefined) {
        return failure({
            messages: [
                'Pass only one of --lumpName (deprecated) or --include; they cannot be used together.',
            ],
        });
    }

    if (lumpNameOpt !== undefined) {
        logger.warn(
            '--lumpName on start is deprecated; use --include=<name> (and optional --daemonId) instead.',
        );
    }

    const include =
        lumpNameOpt !== undefined ? [lumpNameOpt] : includeFromFlags;

    const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
    if (!validationResult.success) return commandFailure(validationResult.data);

    const localConfigResult = await readLocalConfig({ localConfigFolderPath });
    if (!localConfigResult.success) return commandFailure(localConfigResult.data);
    const frozenLocalConfig: LocalConfig = localConfigResult.data;
    const workspaceStrategy = frozenLocalConfig.workspaceStrategy ?? 'checkout';
    const effectivePrimaryBranches = resolvePrimaryBranches(frozenLocalConfig);

    if (cliMaxParallelRun !== undefined && workspaceStrategy !== 'worktree') {
        return failure({
            messages: [
                '--maxParallelRun requires workspaceStrategy "worktree" in local.json (checkout stays sequential).',
            ],
        });
    }

    const targetLumpsResult = await resolveTargetLumpNames({ localConfigFolderPath });
    let allLoadableNames: string[];
    if (!targetLumpsResult.success) {
        const allowEmptyDedicatedDiscovery =
            frozenLocalConfig.mode === 'dedicated' &&
            (frozenLocalConfig.primaryBranches?.length ?? 0) > 1 &&
            targetLumpsResult.data.includes('No lumps');
        const filteredStart = include !== undefined || exclude !== undefined;
        if (!allowEmptyDedicatedDiscovery && !filteredStart) {
            return failure({ messages: [targetLumpsResult.data] });
        }
        allLoadableNames = [];
    } else {
        allLoadableNames = targetLumpsResult.data;
    }

    const matchedAtStart = filterLumpNames({
        names: allLoadableNames,
        include,
        exclude,
    });
    if (matchedAtStart.length === 0 && (include !== undefined || exclude !== undefined)) {
        logger.warn(
            'No lumps match the include/exclude filters at start; the daemon will stay up and idle until a later tick matches.',
        );
    }

    try {
        new CronPattern(cronSetup);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return failure({
            messages: [`Invalid cron expression "${cronSetup}": ${msg}`],
        });
    }

    // Resolve project name early via a temporary global path resolve.
    const nameProbe = await resolveDaemonPaths({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        daemonId: 'global',
    });
    if (!nameProbe.success) return commandFailure(nameProbe.data);
    const { daemonsDir, projectName } = nameProbe.data;

    const runningResult = await listRunningProjectDaemons({ daemonsDir, projectName });
    if (!runningResult.success) {
        return failure({ messages: [runningResult.data] });
    }
    const existingDaemonIds = new Set(Object.keys(runningResult.data));

    const idResult = resolveDaemonId({
        explicitDaemonId,
        include,
        exclude,
        existingDaemonIds,
    });
    if (!idResult.success) {
        return failure({ messages: [idResult.data] });
    }
    const daemonId = idResult.data;

    const daemonPathsResult = await resolveDaemonPaths({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        daemonId,
    });
    if (!daemonPathsResult.success) return commandFailure(daemonPathsResult.data);
    const { pidFilePath, logFilePath, metaFilePath } = daemonPathsResult.data;

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

    const localJsonMaxParallelRun = frozenLocalConfig.maxParallelRun ?? 1;
    const effectiveConcurrency =
        workspaceStrategy === 'worktree'
            ? (cliMaxParallelRun ?? localJsonMaxParallelRun ?? 1)
            : 1;
    const effectiveMaxParallelRunForMeta =
        workspaceStrategy === 'worktree'
            ? (cliMaxParallelRun ?? localJsonMaxParallelRun)
            : undefined;

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
        pushCsvFlag(spawnArgs, '--include', include);
        pushCsvFlag(spawnArgs, '--exclude', exclude);
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

        const stopHint = `\`lumpcode stop --daemonId=${daemonId}\``;
        return success({
            messages: [
                `Lumpcode daemon started (daemonId=${daemonId}). PID file: ${pidFilePath}. Logs: ${logFilePath}.`,
                `Project: "${projectName}". Run ${stopHint} to stop.`,
            ],
            data: {
                cronSetup,
                lumpNames: matchedAtStart,
                ticks: 0,
                daemonId,
                ...(include !== undefined ? { include } : {}),
                ...(exclude !== undefined ? { exclude } : {}),
            },
        });
    }

    const metaPayload: DaemonMetaWrite = {
        daemonId,
        cronSetup,
        workspaceStrategy,
        ...(effectiveMaxParallelRunForMeta !== undefined
            ? { maxParallelRun: effectiveMaxParallelRunForMeta }
            : {}),
        ...(include !== undefined ? { include } : {}),
        ...(exclude !== undefined ? { exclude } : {}),
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
            localJsonMaxParallelRun > 1 &&
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
                const lumpLogger = createCliLogger({
                    verbose:
                        !!cliVerbose ||
                        !!(jsConfForVerbose.success && jsConfForVerbose.data.verbose),
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
                const filteredNames = new Set(
                    filterLumpNames({ names: discoveredNames, include, exclude }),
                );
                for (const { lumpName } of discoverResult.data) {
                    if (!filteredNames.has(lumpName)) continue;
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
            include,
            exclude,
        });
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

    logger.info(
        `Lumpcode daemon on ${cronSetup} (daemonId=${daemonId}). First run now, then on schedule. Press Ctrl+C to stop.`,
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
            // Croner keeps a process-wide registry of job names; parallel tests (and rare
            // same-process multi-daemon cases) collide if the name is only daemonId.
            cronJob = new Cron(
                cronSetup,
                {
                    protect: true,
                    name: `lumpcode-${daemonId}-${process.pid}-${randomBytes(4).toString('hex')}`,
                },
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

    const summaryLines = [
        `Stopped after ${ticks} run(s) (daemonId=${daemonId}).`,
        `Schedule was: ${cronSetup}`,
    ];

    return success({
        messages: summaryLines,
        data: {
            cronSetup,
            lumpNames: matchedAtStart,
            ticks,
            daemonId,
            ...(include !== undefined ? { include } : {}),
            ...(exclude !== undefined ? { exclude } : {}),
        },
    });
};

export const command = {
    handlerMaker,
    name: 'start',
    description:
        'Detach a background scheduler that discovers lumps (global-style) then applies optional --include/--exclude filters on a cron schedule. Pass --daemonId to name the daemon; pass --foreground to run blocking in this terminal.',
    inputSchema,
} satisfies Command;
