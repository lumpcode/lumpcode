import * as z from 'zod';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { DEFAULT_DAEMON_CRON_SETUP } from '../../consts';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { DAEMON_ID_CHARSET } from '../daemonFileBaseName';
import type { DaemonConfigFileMeta } from '../daemonConfigFile';
import { daemonMetaInclude, type DaemonMeta, type DaemonMetaWrite } from '../readDaemonMeta';
import { readJsonFile } from '../readJsonFile';
import { writeJsonFile } from '../writeJsonFile';

/** In-memory launch spec. desired.json is this minus workspaceStrategy and daemonConfigFile. */
export type StartDaemonRecipe = {
    projectRoot: string;
    daemonId: string;
    cronSetup: string;
    workspaceStrategy: WorkspaceStrategy;
    include?: string[];
    exclude?: string[];
    maxParallelRun?: number;
    /** File-launch marker for meta only; never written to desired.json. */
    daemonConfigFile?: DaemonConfigFileMeta;
};

export type StartDaemonDesired = Omit<StartDaemonRecipe, 'workspaceStrategy' | 'daemonConfigFile'> & {
    stopping?: true;
};

const startDaemonDesiredSchema = z.object({
    projectRoot: z.string().min(1),
    daemonId: z.string().regex(DAEMON_ID_CHARSET),
    cronSetup: z.string().min(1),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
    maxParallelRun: z.number().int().positive().optional(),
    stopping: z.literal(true).optional(),
});

export function toDesired(recipe: StartDaemonRecipe): StartDaemonDesired {
    const {
        workspaceStrategy: _workspaceStrategy,
        daemonConfigFile: _daemonConfigFile,
        ...desired
    } = recipe;
    return desired;
}

/** Only Recipe constructor from a desired snapshot. Drops `stopping`. */
export function recipeFromDesired(
    desired: StartDaemonDesired,
    workspaceStrategy: WorkspaceStrategy,
): StartDaemonRecipe {
    const { stopping: _stopping, ...fields } = desired;
    return { ...fields, workspaceStrategy };
}

export function toMetaWrite(recipe: StartDaemonRecipe): DaemonMetaWrite {
    return {
        daemonId: recipe.daemonId,
        cronSetup: recipe.cronSetup,
        workspaceStrategy: recipe.workspaceStrategy,
        include: recipe.include,
        exclude: recipe.exclude,
        maxParallelRun: recipe.maxParallelRun,
        ...(recipe.daemonConfigFile !== undefined
            ? { daemonConfigFile: recipe.daemonConfigFile }
            : {}),
    };
}

export function fromMeta(
    meta: DaemonMeta,
    input: { projectRoot: string; daemonId: string },
): StartDaemonDesired {
    return {
        projectRoot: input.projectRoot,
        daemonId: meta.daemonId ?? input.daemonId,
        cronSetup: meta.cronSetup?.trim() || DEFAULT_DAEMON_CRON_SETUP,
        include: daemonMetaInclude(meta),
        exclude: meta.exclude,
        maxParallelRun: meta.maxParallelRun,
    };
}

function pushCsvOption(spawnArgs: string[], flag: string, values: string[] | undefined): void {
    if (values !== undefined && values.length > 0) {
        spawnArgs.push(flag, values.join(','));
    }
}

/** Argv for a detached `start --foreground` child. */
export function toForegroundArgs(
    recipe: Pick<StartDaemonRecipe, 'daemonId' | 'cronSetup' | 'include' | 'exclude' | 'maxParallelRun'>,
    extraFlags?: { json?: boolean; verbose?: boolean },
): string[] {
    const args = [
        'start',
        '--foreground',
        '--cronSetup',
        recipe.cronSetup,
        '--daemonId',
        recipe.daemonId,
    ];
    pushCsvOption(args, '--include', recipe.include);
    pushCsvOption(args, '--exclude', recipe.exclude);
    if (recipe.maxParallelRun !== undefined) {
        args.push('--maxParallelRun', String(recipe.maxParallelRun));
    }
    if (extraFlags?.json === true) {
        args.push('--json');
    }
    if (extraFlags?.verbose === true) {
        args.push('--verbose');
    }
    return args;
}

export async function readStartDaemonDesired(
    desiredFilePath: string,
): Promise<Success<StartDaemonDesired | undefined> | Failure<string>> {
    const readResult = await readJsonFile<unknown>({
        filePath: desiredFilePath,
        ifMissing: 'undefined',
    });
    if (!readResult.success) {
        return readResult;
    }
    if (readResult.data === undefined) {
        return success(undefined);
    }
    const validated = startDaemonDesiredSchema.safeParse(readResult.data);
    if (!validated.success) {
        return failure(`Invalid daemon desired file ${desiredFilePath}: ${validated.error.message}`);
    }
    return success(validated.data);
}

export async function writeStartDaemonDesired(input: {
    desiredFilePath: string;
    desired: StartDaemonDesired;
}): Promise<Success<void> | Failure<string>> {
    return writeJsonFile({
        filePath: input.desiredFilePath,
        data: input.desired,
        trailingNewline: true,
        mkdir: true,
    });
}

export async function markStartDaemonDesiredStopping(input: {
    desiredFilePath: string;
}): Promise<Success<void> | Failure<string>> {
    const readResult = await readStartDaemonDesired(input.desiredFilePath);
    if (!readResult.success) {
        return readResult;
    }
    if (readResult.data === undefined || readResult.data.stopping === true) {
        return success(undefined);
    }
    return writeStartDaemonDesired({
        desiredFilePath: input.desiredFilePath,
        desired: { ...readResult.data, stopping: true },
    });
}
