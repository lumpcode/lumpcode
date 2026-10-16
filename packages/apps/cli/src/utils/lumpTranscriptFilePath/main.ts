import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { appendMissingGitignoreLines } from '../appendMissingGitignoreLines';

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
