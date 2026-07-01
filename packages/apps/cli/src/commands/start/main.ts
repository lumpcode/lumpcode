import * as fs from 'node:fs/promises';
import { spawn as nodeSpawn } from 'node:child_process';
import { isSea } from 'node:sea';
import * as z from 'zod';
import { Cron, CronPattern } from 'croner';

import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import type { LocalConfig } from '../../types/LocalConfig';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    assertDaemonStartAllowed,
    commandFailure,
    createCliLogger,
    discoverLoadableLumpNames,
    formatDeamonLumpScopeCliOutput,
    listRunningProjectDaemons,
    readLocalConfig,
    readProjectJsonBaseBranch,
    resolveDiscoveryBranches,
    resolveLumpBranches,
    resolveTargetLumpNames,
    runProjectPreflight,
    runLumpFromJsConfig,
    validateDaemonLaunch,
} from '../../utils';
import { resolveDaemonPaths } from '../../utils/resolveDaemonPaths';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';
import { getJsConfigFromLumpName } from '../../utils/getJsConfigFromLumpName';
import { lumpImportBasePath } from '../../utils/lumpDirPath';
import { resolveLumpDisabled } from '../../utils/resolveLumpDisabled';
import type { DaemonMetaWrite } from '../../utils/readDaemonMeta';

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

const waitForShutdown: () => Promise<void> = () =>
    new Promise((resolve) => {
        const onSignal = () => {
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

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath, waitForShutdownOverride, spawnFn } =
        injections;
    const { json, verbose: cliVerbose } = input.options;
    const foreground = input.options.foreground === true;
    const cronSetup = input.options.cronSetup?.trim() || defaultCronPattern;
    const lumpNameOpt = input.options.lumpName?.trim() ? input.options.lumpName.trim() : undefined;
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
    const effectiveDiscoveryBranches = resolveDiscoveryBranches(frozenLocalConfig);

    const targetLumpsResult = await resolveTargetLumpNames({
        localConfigFolderPath,
        lumpName: lumpNameOpt,
    });
    let initialLumps: string[];
    if (!targetLumpsResult.success) {
        const allowEmptyDedicatedDiscovery =
            !lumpNameOpt &&
            frozenLocalConfig.mode === 'dedicated' &&
            (frozenLocalConfig.discoveryBranches?.length ?? 0) > 1 &&
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
        return failure({ messages: [startAllowed.data] });
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
            effectiveDiscoveryBranches.length > 1 &&
            !sharedMultiDiscoveryWarningLogged
        ) {
            logger.info(
                'local.json lists multiple discovery branches; multi-discovery daemon scans are dedicated-only. ' +
                    'Using the primary discovery branch for shared mode.',
            );
            sharedMultiDiscoveryWarningLogged = true;
        }

        const projectJsonBaseBranch = await readProjectJsonBaseBranch({ localConfigFolderPath });

        const runOneLump = async (input: {
            lumpName: string;
            targetBaseBranch: string;
        }): Promise<void> => {
            const { lumpName, targetBaseBranch } = input;
            const preflightResult = await runProjectPreflight({
                sourceProjectRoot: projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
                localConfig: frozenLocalConfig,
                targetBranch: targetBaseBranch,
            });
            if (!preflightResult.success) {
                logger.error(`pre-flight failed for lump "${lumpName}": ${preflightResult.data}`);
                return;
            }
            const { executionWorkspacePath, projectBaseBranch, workspaceStrategy } =
                preflightResult.data;

            const jsConfResult = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
            if (!jsConfResult.success) {
                logger.error(`lump "${lumpName}": ${jsConfResult.data}`);
                return;
            }
            const disabledResult = await resolveLumpDisabled(jsConfResult.data.disabled, {
                importBasePath: lumpImportBasePath({ localConfigFolderPath, lumpName }),
            });
            if (!disabledResult.success) {
                logger.error(`lump "${lumpName}": ${disabledResult.data}`);
                return;
            }
            if (disabledResult.data.disabled) {
                logger.info(`lump "${lumpName}": skipped (disabled)`);
                return;
            }
            const lumpLogger = createCliLogger({
                verbose: !!cliVerbose || !!jsConfResult.data.verbose,
                json: !!json,
                prefix: '[lumpcode start]',
            });
            const runLumpRes = await runLumpFromJsConfig({
                jsConfig: jsConfResult.data,
                lumpName,
                localConfigFolderPath,
                globalConfigFolderPath,
                projectBaseBranch,
                executionWorkspacePath,
                workspaceStrategy,
                lockMode: 'wait',
                projectName,
                logger: lumpLogger,
            });
            if (!runLumpRes.success) {
                const errMsg =
                    typeof runLumpRes.data === 'string' ? runLumpRes.data : runLumpRes.data.message;
                logger.error(`lump "${lumpName}": ${errMsg}`);
            } else if (runLumpRes.data.skipped) {
                logger.info(
                    `lump "${lumpName}" skipped: ${runLumpRes.data.reason} - ${runLumpRes.data.reasonDetail}`,
                );
            } else {
                const contextNames = runLumpRes.data.result.contextNames;
                logger.info(
                    `lump "${lumpName}": ok (contexts: ${contextNames.join(', ') || 'none'})`,
                );
            }
        };

        if (lumpNameOpt) {
            const jsConfResult = await getJsConfigFromLumpName({ lumpName: lumpNameOpt, localConfigFolderPath });
            if (!jsConfResult.success) {
                logger.error(`lump "${lumpNameOpt}": ${jsConfResult.data}`);
                return;
            }
            const { resolvedBaseBranch } = resolveLumpBranches({
                lumpConfig: jsConfResult.data,
                localConfig: frozenLocalConfig,
                projectJsonBaseBranch,
            });
            ticks += 1;
            logger.info(`tick ${ticks} — running lump "${lumpNameOpt}"…`);
            await runOneLump({ lumpName: lumpNameOpt, targetBaseBranch: resolvedBaseBranch });
            return;
        }

        if (frozenLocalConfig.mode === 'dedicated') {
            ticks += 1;
            const lumpsThisTick: string[] = [];

            for (const discoveryBranch of effectiveDiscoveryBranches) {
                const discoveryPreflight = await runProjectPreflight({
                    sourceProjectRoot: projectRoot,
                    localConfigFolderPath,
                    globalConfigFolderPath,
                    localConfig: frozenLocalConfig,
                    targetBranch: discoveryBranch,
                });
                if (!discoveryPreflight.success) {
                    logger.error(
                        `pre-flight failed for discovery branch "${discoveryBranch}": ${discoveryPreflight.data}`,
                    );
                    continue;
                }

                const lumpNames = await discoverLoadableLumpNames(localConfigFolderPath);
                for (const lumpName of lumpNames) {
                    const jsConfResult = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
                    if (!jsConfResult.success) {
                        logger.error(`lump "${lumpName}": ${jsConfResult.data}`);
                        continue;
                    }
                    const branches = resolveLumpBranches({
                        lumpConfig: jsConfResult.data,
                        localConfig: frozenLocalConfig,
                        projectJsonBaseBranch,
                    });
                    if (branches.resolvedDiscoveryBranch !== discoveryBranch) {
                        continue;
                    }
                    lumpsThisTick.push(lumpName);
                    await runOneLump({
                        lumpName,
                        targetBaseBranch: branches.resolvedBaseBranch,
                    });
                }
            }

            logger.info(
                `tick ${ticks} — ran ${lumpsThisTick.length} lump(s)…` +
                    (lumpsThisTick.length ? ` [${lumpsThisTick.join(', ')}]` : ''),
            );
            return;
        }

        const namesResult = await resolveTargetLumpNames({
            localConfigFolderPath,
            lumpName: lumpNameOpt,
        });
        if (!namesResult.success) {
            logger.warn(`${namesResult.data}; skipping.`);
            return;
        }
        const names = namesResult.data;
        if (names.length === 0) {
            logger.warn('no lumps found this tick; skipping.');
            return;
        }

        ticks += 1;
        logger.info(`tick ${ticks} — running ${names.length} lump(s)… [${names.join(', ')}]`);
        for (const lumpName of names) {
            const jsConfResult = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
            if (!jsConfResult.success) {
                logger.error(`lump "${lumpName}": ${jsConfResult.data}`);
                continue;
            }
            const { resolvedBaseBranch } = resolveLumpBranches({
                lumpConfig: jsConfResult.data,
                localConfig: frozenLocalConfig,
                projectJsonBaseBranch,
            });
            await runOneLump({ lumpName, targetBaseBranch: resolvedBaseBranch });
        }
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
        logger,
    });
    if (!launchValidation.success) {
        await tryRemoveOwnDaemonArtifacts(pidFilePath, metaFilePath);
        return failure({ messages: [launchValidation.data] });
    }

    await runTick();

    try {
        cronJob = new Cron(
            cronSetup,
            { protect: true },
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

    await (waitForShutdownOverride ?? waitForShutdown)();
    cronJob?.stop();

    await tryRemoveOwnDaemonArtifacts(pidFilePath, metaFilePath);

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
