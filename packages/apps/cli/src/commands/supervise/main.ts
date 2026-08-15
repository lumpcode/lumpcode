import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { SUPERVISE_LOCAL_PASS_INTERVAL_MS } from '../../consts';
import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    claimPidAndWriteMeta,
    commandFailure,
    createCliLogger,
    daemonsDirPath,
    getProjectName,
    installDaemonProcessGuards,
    installProcessShutdown,
    removeOwnPidArtifacts,
    runSuperviseLocalPass,
    supervisorDirPath,
    supervisorLogPath,
    supervisorMetaPath,
    supervisorPidPath,
} from '../../utils';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';
import { pollUntil } from '../../utils/pollUntil';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        foreground: z
            .boolean()
            .optional()
            .describe('Run blocking in this terminal (required; detach via start or systemd)'),
        projectRoot: z
            .string()
            .optional()
            .describe('Absolute project workspace path (default: current working directory)'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: {
        projectName: string;
        pid?: number;
    };
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    waitForShutdownOverride?: () => Promise<void>;
    spawnFn?: typeof nodeSpawn;
    localPassIntervalMs?: number;
}

async function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted || ms <= 0) {
        return;
    }
    await pollUntil({
        timeoutMs: ms,
        intervalMs: Math.min(50, ms),
        poll: () => (signal.aborted ? true : undefined),
    });
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const {
        globalConfigFolderPath,
        waitForShutdownOverride,
        spawnFn,
        localPassIntervalMs = SUPERVISE_LOCAL_PASS_INTERVAL_MS,
    } = injections;
    const foreground = input.options.foreground === true;
    const json = input.options.json === true;
    const logger = createCliLogger({
        verbose: !!input.options.verbose,
        json,
        prefix: '[lumpcode supervise]',
    });

    if (!foreground) {
        return failure({
            messages: [
                'Pass --foreground. Detach the supervisor via `lumpcode start` or a systemd unit (`Restart=always`).',
            ],
        });
    }

    const projectRootOption = input.options.projectRoot?.trim();
    const projectRoot = projectRootOption
        ? path.resolve(projectRootOption)
        : path.resolve(injections.projectRoot);
    const localConfigFolderPath = projectRootOption
        ? path.join(projectRoot, '.lumpcode')
        : injections.localConfigFolderPath;

    const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
    if (!validationResult.success) return commandFailure(validationResult.data);

    const nameResult = await getProjectName({ localConfigFolderPath, projectRoot });
    if (!nameResult.success) return commandFailure(nameResult.data);
    const projectName = nameResult.data;
    const daemonsDir = daemonsDirPath({ globalConfigFolderPath });
    const pidFilePath = supervisorPidPath({ globalConfigFolderPath, projectName });
    const metaFilePath = supervisorMetaPath({ globalConfigFolderPath, projectName });
    const logFilePath = supervisorLogPath({ globalConfigFolderPath, projectName });

    await fs.mkdir(supervisorDirPath({ globalConfigFolderPath }), { recursive: true });
    const claim = await claimPidAndWriteMeta({
        pid: process.pid,
        pidFilePath,
        meta: {
            filePath: metaFilePath,
            data: { projectRoot, startedAt: new Date().toISOString() },
        },
        onMetaFailure: 'fail',
    });
    if (!claim.success) {
        return failure({ messages: [claim.data] });
    }

    const abortController = new AbortController();
    const shutdown = installProcessShutdown({
        logger,
        signalMessage: (signal) => `signal ${signal}; shutting down supervisor`,
        onSignal: () => {
            abortController.abort();
        },
        waitForShutdownOverride,
    });

    logger.info(
        `Supervisor for "${projectName}" (pid ${process.pid}). Local pass every ${localPassIntervalMs / 1000}s. Log: ${logFilePath}.`,
    );

    const disposeGuards = installDaemonProcessGuards({ logger });
    try {
        while (!abortController.signal.aborted) {
            const localResult = await runSuperviseLocalPass({
                projectName,
                projectRoot,
                daemonsDir,
                logger,
                spawnFn,
            });
            if (!localResult.success) {
                logger.error(`local pass failed: ${localResult.data}`);
            }
            await abortableSleep(localPassIntervalMs, abortController.signal);
        }

        await shutdown.promise;
    } finally {
        shutdown.dispose();
        disposeGuards();
        await removeOwnPidArtifacts({ pidFilePath, extraFilePaths: [metaFilePath] });
    }

    return success({
        messages: [`Stopped supervisor for "${projectName}".`],
        data: { projectName, pid: process.pid },
    });
};

export const command = {
    handlerMaker,
    name: 'supervise',
    description:
        'Run the per-project supervisor that respawns start-daemons from desired.json. Pass `--foreground` (required). `lumpcode start` starts this process when it is down.',
    inputSchema,
} satisfies Command;
