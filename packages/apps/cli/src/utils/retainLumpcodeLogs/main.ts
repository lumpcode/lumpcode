import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { failure, nodeErrnoCode, success, type Failure, type Logger, type Success } from '@lumpcode/core';

import { daemonSchedulerFiles, listDaemonIds } from '../daemonSchedulerFiles';
import { daemonsDirPath } from '../daemonsDirPath';
import { localConfigFolderPath } from '../localConfigFolderPath';
import { lumpsDirPath } from '../lumpDirPath';
import { supervisorLogPath } from '../supervisorPaths';

export const DEFAULT_LOG_RETENTION_MAX_AGE_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ISO-8601 datetime as the first token, optionally after a `[logger prefix]`. */
const LEADING_ISO_TIMESTAMP_RE =
    /^(?:\[[^\]]+\]\s+)?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))(?:\s|$)/;

export type RetainLumpcodeLogsInput = {
    projectRoot: string;
    projectName: string;
    globalConfigFolderPath: string;
    maxAgeDays?: number;
    logger: Logger;
};

function cutoffMsFromMaxAgeDays(maxAgeDays: number): number {
    return Date.now() - maxAgeDays * MS_PER_DAY;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function walkFiles(dirPath: string): Promise<string[]> {
    let entries;
    try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (error: unknown) {
        if (nodeErrnoCode(error) === 'ENOENT') {
            return [];
        }
        throw error;
    }
    const files: string[] = [];
    for (const entry of entries) {
        const childPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await walkFiles(childPath)));
        } else if (entry.isFile()) {
            files.push(childPath);
        }
    }
    return files;
}

async function deleteFileIfOlderThan(filePath: string, cutoffMs: number): Promise<void> {
    let stat;
    try {
        stat = await fs.stat(filePath);
    } catch (error: unknown) {
        if (nodeErrnoCode(error) === 'ENOENT') {
            return;
        }
        throw error;
    }
    if (!stat.isFile() || stat.mtimeMs >= cutoffMs) {
        return;
    }
    try {
        await fs.unlink(filePath);
    } catch (error: unknown) {
        if (nodeErrnoCode(error) === 'ENOENT') {
            return;
        }
        throw error;
    }
}

function shouldKeepLogLine(line: string, cutoffMs: number): boolean {
    const match = LEADING_ISO_TIMESTAMP_RE.exec(line);
    if (!match) {
        return true;
    }
    const timestampMs = Date.parse(match[1]!);
    if (Number.isNaN(timestampMs)) {
        return true;
    }
    return timestampMs >= cutoffMs;
}

async function trimLogInPlace(filePath: string, cutoffMs: number): Promise<void> {
    let raw: string;
    try {
        raw = await fs.readFile(filePath, 'utf8');
    } catch (error: unknown) {
        if (nodeErrnoCode(error) === 'ENOENT') {
            return;
        }
        throw error;
    }
    const lines = raw.split(/\r?\n/);
    const hadTrailingNewline = lines.length > 0 && lines[lines.length - 1] === '';
    const body = hadTrailingNewline ? lines.slice(0, -1) : lines;
    const kept = body.filter((line) => shouldKeepLogLine(line, cutoffMs));
    let next = kept.join('\n');
    if (hadTrailingNewline) {
        next += '\n';
    }
    if (next === raw) {
        return;
    }
    await fs.writeFile(filePath, next, 'utf8');
}

async function deleteOldFilesUnder(dirPath: string, cutoffMs: number): Promise<void> {
    const files = await walkFiles(dirPath);
    for (const filePath of files) {
        await deleteFileIfOlderThan(filePath, cutoffMs);
    }
}

async function retainLumpcodeLogsBody(input: {
    projectRoot: string;
    projectName: string;
    globalConfigFolderPath: string;
    maxAgeDays: number;
}): Promise<Success<void> | Failure<string>> {
    const { projectRoot, projectName, globalConfigFolderPath, maxAgeDays } = input;
    const cutoffMs = cutoffMsFromMaxAgeDays(maxAgeDays);
    const lumpsDir = lumpsDirPath({
        localConfigFolderPath: localConfigFolderPath({ projectRoot }),
    });

    let lumpEntries: Dirent[] = [];
    try {
        lumpEntries = await fs.readdir(lumpsDir, { withFileTypes: true });
    } catch (error: unknown) {
        if (nodeErrnoCode(error) !== 'ENOENT') {
            return failure(`Cannot read lumps directory "${lumpsDir}": ${errorMessage(error)}`);
        }
    }

    for (const entry of lumpEntries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const lumpDir = path.join(lumpsDir, entry.name);
        try {
            await deleteOldFilesUnder(path.join(lumpDir, 'transcripts'), cutoffMs);
            await deleteOldFilesUnder(path.join(lumpDir, 'history'), cutoffMs);
        } catch (error: unknown) {
            return failure(
                `Cannot retain files under "${lumpDir}": ${errorMessage(error)}`,
            );
        }
    }

    const daemonsDir = daemonsDirPath({ globalConfigFolderPath });
    const idsResult = await listDaemonIds({
        dir: daemonsDir,
        projectName,
        kind: 'log',
    });
    if (!idsResult.success) {
        return idsResult;
    }

    const logPaths = [
        ...idsResult.data.map(
            (daemonId) =>
                daemonSchedulerFiles({ daemonsDir, projectName, daemonId }).logFilePath,
        ),
        supervisorLogPath({ globalConfigFolderPath, projectName }),
    ];

    for (const logFilePath of logPaths) {
        try {
            await trimLogInPlace(logFilePath, cutoffMs);
        } catch (error: unknown) {
            return failure(`Cannot trim log "${logFilePath}": ${errorMessage(error)}`);
        }
    }

    return success(undefined);
}

/**
 * Deletes old transcript/history files and trims this project's daemon and
 * supervisor logs in place. Omitted `maxAgeDays` is 14. `0` keeps everything.
 */
export async function retainLumpcodeLogs(
    input: RetainLumpcodeLogsInput,
): Promise<Success<void> | Failure<string>> {
    const days = input.maxAgeDays ?? DEFAULT_LOG_RETENTION_MAX_AGE_DAYS;
    if (!Number.isInteger(days) || days < 0) {
        return failure('maxAgeDays must be an integer ≥ 0');
    }
    if (days === 0) {
        return success(undefined);
    }
    try {
        return await retainLumpcodeLogsBody({
            projectRoot: input.projectRoot,
            projectName: input.projectName,
            globalConfigFolderPath: input.globalConfigFolderPath,
            maxAgeDays: days,
        });
    } catch (error: unknown) {
        return failure(errorMessage(error));
    }
}
