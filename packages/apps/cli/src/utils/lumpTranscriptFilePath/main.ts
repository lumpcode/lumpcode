import { appendFileSync, mkdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { failure, nodeErrnoCode, success, type Failure, type Success } from '@lumpcode/core';

import { appendMissingGitignoreLines } from '../appendMissingGitignoreLines';
import { assertValidLumpName, isValidLumpName } from '../isValidLumpName';

export const TRANSCRIPTS_GITIGNORE_LINE = '.lumpcode/**/transcripts/';

export function lumpTranscriptFilePath({
    projectRoot,
    lumpName,
    discoveryBranch,
    tickStartedAt,
}: {
    projectRoot: string;
    lumpName: string;
    discoveryBranch: string;
    tickStartedAt: string;
}): Success<string> | Failure<string> {
    const segments = discoveryBranch.split('/');
    for (const segment of segments) {
        if (segment.length === 0 || segment === '.' || segment === '..') {
            return failure(`Invalid transcript branch segment in "${discoveryBranch}"`);
        }
    }
    const stamp = tickStartedAt.replace(/:/g, '-');
    return success(join(
        projectRoot,
        '.lumpcode',
        'lumps',
        lumpName,
        'transcripts',
        ...segments,
        `${stamp}.log`,
    ));
}

export async function prepareLumpTranscriptFile({
    projectRoot,
    lumpName,
    discoveryBranch,
    tickStartedAt,
}: {
    projectRoot: string;
    lumpName: string;
    discoveryBranch: string;
    tickStartedAt: string;
}): Promise<Success<{ filePath: string; write: (text: string) => void }> | Failure<string>> {
    const pathResult = lumpTranscriptFilePath({
        projectRoot,
        lumpName,
        discoveryBranch,
        tickStartedAt,
    });
    if (!pathResult.success) return pathResult;

    const gitignoreResult = await appendMissingGitignoreLines({
        projectRoot,
        lines: [TRANSCRIPTS_GITIGNORE_LINE],
    });
    if (!gitignoreResult.success) return gitignoreResult;

    const filePath = pathResult.data;
    let opened = false;
    return success({
        filePath,
        write: (text: string) => {
            if (!text) return;
            if (!opened) {
                mkdirSync(dirname(filePath), { recursive: true });
                opened = true;
            }
            appendFileSync(filePath, text);
        },
    });
}

export type LumpTranscriptFile = {
    lumpName: string;
    discoveryBranch: string;
    stamp: string;
    filePath: string;
};

function lumpsDir(projectRoot: string): string {
    return join(projectRoot, '.lumpcode', 'lumps');
}

function transcriptsDir(projectRoot: string, lumpName: string): string {
    return join(lumpsDir(projectRoot), lumpName, 'transcripts');
}

async function listLumpDirectoryNames(projectRoot: string): Promise<string[]> {
    let entries;
    try {
        entries = await readdir(lumpsDir(projectRoot), { withFileTypes: true });
    } catch (error: unknown) {
        if (nodeErrnoCode(error) === 'ENOENT') return [];
        throw error;
    }
    return entries
        .filter((ent) => ent.isDirectory() && isValidLumpName(ent.name))
        .map((ent) => ent.name);
}

async function walkLogFiles(
    dir: string,
    relativePrefix: string,
): Promise<Array<{ discoveryBranch: string; stamp: string; filePath: string }>> {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch (error: unknown) {
        if (nodeErrnoCode(error) === 'ENOENT') return [];
        throw error;
    }
    const rows: Array<{ discoveryBranch: string; stamp: string; filePath: string }> = [];
    for (const ent of entries) {
        const fullPath = join(dir, ent.name);
        if (ent.isDirectory()) {
            const nextRel = relativePrefix ? `${relativePrefix}/${ent.name}` : ent.name;
            rows.push(...await walkLogFiles(fullPath, nextRel));
            continue;
        }
        if (!ent.isFile() || !ent.name.endsWith('.log')) continue;
        rows.push({
            discoveryBranch: relativePrefix,
            stamp: ent.name.slice(0, -'.log'.length),
            filePath: fullPath,
        });
    }
    return rows;
}

function compareTranscriptFiles(a: LumpTranscriptFile, b: LumpTranscriptFile): number {
    if (a.stamp !== b.stamp) return a.stamp < b.stamp ? 1 : -1;
    if (a.lumpName !== b.lumpName) return a.lumpName < b.lumpName ? -1 : 1;
    if (a.discoveryBranch !== b.discoveryBranch) {
        return a.discoveryBranch < b.discoveryBranch ? -1 : 1;
    }
    return 0;
}

function noMatchingTranscriptMessage({
    lumpName,
    discoveryBranch,
    stamp,
}: {
    lumpName: string;
    discoveryBranch?: string;
    stamp?: string;
}): string {
    const flags = [`lump "${lumpName}"`];
    if (discoveryBranch !== undefined) flags.push(`--discoveryBranch ${discoveryBranch}`);
    if (stamp !== undefined) flags.push(`--stamp ${stamp}`);
    return `No transcript file for ${flags.join(', ')}. Use --list to see available transcripts.`;
}

export async function listLumpTranscriptFiles(input: {
    projectRoot: string;
    lumpName?: string;
    discoveryBranch?: string;
}): Promise<Success<LumpTranscriptFile[]> | Failure<string>> {
    const { projectRoot, lumpName, discoveryBranch } = input;
    if (lumpName !== undefined) {
        const valid = assertValidLumpName(lumpName);
        if (!valid.ok) return failure(valid.message);
    }
    try {
        const lumpNames = lumpName !== undefined
            ? [lumpName]
            : await listLumpDirectoryNames(projectRoot);
        const files: LumpTranscriptFile[] = [];
        for (const name of lumpNames) {
            const rows = await walkLogFiles(transcriptsDir(projectRoot, name), '');
            for (const row of rows) {
                if (discoveryBranch !== undefined && row.discoveryBranch !== discoveryBranch) {
                    continue;
                }
                files.push({ lumpName: name, ...row });
            }
        }
        files.sort(compareTranscriptFiles);
        return success(files);
    } catch (error: unknown) {
        return failure(`Cannot read transcripts: ${String(error)}`);
    }
}

export async function resolveLumpTranscriptFile(input: {
    projectRoot: string;
    lumpName: string;
    discoveryBranch?: string;
    stamp?: string;
}): Promise<Success<LumpTranscriptFile> | Failure<string>> {
    const { projectRoot, lumpName, discoveryBranch, stamp } = input;
    const listed = await listLumpTranscriptFiles({ projectRoot, lumpName, discoveryBranch });
    if (!listed.success) return listed;
    const files = stamp !== undefined
        ? listed.data.filter((file) => file.stamp === stamp)
        : listed.data;
    if (files.length === 0) {
        return failure(noMatchingTranscriptMessage({ lumpName, discoveryBranch, stamp }));
    }
    const newestStamp = files[0]!.stamp;
    const atNewest = files.filter((file) => file.stamp === newestStamp);
    if (atNewest.length > 1 && discoveryBranch === undefined) {
        return failure(
            `Multiple transcripts share stamp "${newestStamp}" for lump "${lumpName}". Pass --discoveryBranch to choose one.`,
        );
    }
    return success(atNewest[0]!);
}
