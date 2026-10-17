import { spawn as nodeSpawn } from 'node:child_process';
import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { commandFailure } from '../../utils/commandFailure';
import {
    DEFAULT_TAIL_LINES,
    listLumpTranscriptFiles,
    resolveLumpTranscriptFile,
    tailFile,
} from '../../utils';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        lumpName: z.string().optional().describe('Lump whose transcript to print (required unless --list)'),
        discoveryBranch: z
            .string()
            .optional()
            .describe('Exact discovery branch of the transcript file'),
        stamp: z
            .string()
            .optional()
            .describe('Transcript filename token without .log'),
        lines: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe('Number of initial lines to show (omitted = 10; 0 = whole file)'),
        noFollow: z.boolean().optional().describe('Print lines and exit instead of following live'),
        list: z.boolean().optional().describe('Catalog transcript files instead of printing one'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type TranscriptFileData = {
    lumpName: string;
    discoveryBranch: string;
    stamp: string;
    filePath: string;
};

export type Output = {
    messages: string[];
    data?: {
        lumpName: string;
        discoveryBranch: string;
        stamp: string;
        filePath: string;
        lines: string[];
    } | {
        transcripts: TranscriptFileData[];
    };
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
    spawnFn?: typeof nodeSpawn;
}

function formatListLine(row: TranscriptFileData): string {
    return `${row.stamp}  ${row.lumpName}  ${row.discoveryBranch}`;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, spawnFn } = injections;
    const {
        lumpName,
        discoveryBranch,
        stamp,
        json: jsonOutput,
    } = input.options;
    const list = input.options.list === true;
    const noFollow = input.options.noFollow === true;
    const linesOpt = input.options.lines;

    const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
    if (!validationResult.success) return commandFailure(validationResult.data);

    if (list) {
        if (stamp !== undefined || linesOpt !== undefined || noFollow) {
            return failure({
                messages: ['--list cannot be combined with --stamp, --lines, or --noFollow.'],
            });
        }
        const listed = await listLumpTranscriptFiles({
            projectRoot,
            lumpName,
            discoveryBranch,
        });
        if (!listed.success) return commandFailure(listed.data);
        const messages = listed.data.map(formatListLine);
        return success({
            messages,
            data: { transcripts: listed.data },
        });
    }

    if (!lumpName) {
        return failure({
            messages: ['Pass --lumpName to print a transcript, or --list to catalog transcript files.'],
        });
    }

    if (jsonOutput && !noFollow) {
        return failure({
            messages: ['--json requires --noFollow when printing a transcript.'],
        });
    }

    const resolved = await resolveLumpTranscriptFile({
        projectRoot,
        lumpName,
        discoveryBranch,
        stamp,
    });
    if (!resolved.success) return commandFailure(resolved.data);

    const tailResult = await tailFile({
        filePath: resolved.data.filePath,
        lines: linesOpt ?? DEFAULT_TAIL_LINES,
        follow: !noFollow,
        spawnFn,
    });
    if (!tailResult.success) return commandFailure(tailResult.data);

    if (!noFollow) {
        return success({
            messages: ['Stopped following transcript.'],
        });
    }

    const outputLines = 'lines' in tailResult.data ? tailResult.data.lines : [];
    return success({
        messages: outputLines,
        data: {
            lumpName: resolved.data.lumpName,
            discoveryBranch: resolved.data.discoveryBranch,
            stamp: resolved.data.stamp,
            filePath: resolved.data.filePath,
            lines: outputLines,
        },
    });
};

export const command = {
    handlerMaker,
    name: 'transcript',
    description:
        'Print or follow a daemon transcript file (follows live by default). Pass --list to catalog stamps and branches. Pass --noFollow to print and exit.',
    inputSchema,
} satisfies Command;
