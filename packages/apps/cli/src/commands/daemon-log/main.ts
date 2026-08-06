import { access } from 'node:fs/promises';
import { spawn as nodeSpawn } from 'node:child_process';
import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { createCliLogger, resolveDaemonCommandScope } from '../../utils';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        daemonId: z.string().optional().describe('Read the log for this daemon id'),
        lumpName: z
            .string()
            .optional()
            .describe('Deprecated: treated as --daemonId'),
        lines: z.number().int().positive().optional().describe('Number of initial lines to show'),
        noFollow: z.boolean().optional().describe('Print lines and exit instead of following live'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type LogData = {
    logFilePath: string;
    lines: string[];
    daemonId: string;
};

export type Output = {
    messages: string[];
    data?: LogData;
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    spawnFn?: typeof nodeSpawn;
}

export function buildTailArgs(logFilePath: string, lines?: number, noFollow?: boolean): string[] {
    const args: string[] = [];
    if (lines !== undefined) {
        args.push('-n', String(lines));
    }
    if (!noFollow) {
        args.push('-f');
    }
    args.push(logFilePath);
    return args;
}

function runTailNoFollow(
    spawnFn: typeof nodeSpawn,
    args: string[],
): Promise<{ stdout: string } | { error: string }> {
    return new Promise((resolve) => {
        const child = spawnFn('tail', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk: Buffer | string) => {
            stdout += typeof chunk === 'string' ? chunk : chunk.toString();
        });
        child.stderr?.on('data', (chunk: Buffer | string) => {
            stderr += typeof chunk === 'string' ? chunk : chunk.toString();
        });
        child.on('error', (err) => resolve({ error: `Could not run tail: ${err.message}` }));
        child.on('close', (code) => {
            if (code !== 0) {
                const detail = stderr.trim() ? `: ${stderr.trim()}` : '';
                resolve({ error: `tail exited with code ${code ?? 'unknown'}${detail}` });
                return;
            }
            resolve({ stdout });
        });
    });
}

function runTailFollow(
    spawnFn: typeof nodeSpawn,
    args: string[],
): Promise<{ ok: true } | { error: string }> {
    return new Promise((resolve) => {
        const child = spawnFn('tail', args, { stdio: 'inherit' });
        const onSignal = () => {
            child.kill('SIGTERM');
        };
        process.once('SIGINT', onSignal);
        process.once('SIGTERM', onSignal);
        child.on('error', (err) => {
            process.off('SIGINT', onSignal);
            process.off('SIGTERM', onSignal);
            resolve({ error: `Could not run tail: ${err.message}` });
        });
        child.on('close', (code, signal) => {
            process.off('SIGINT', onSignal);
            process.off('SIGTERM', onSignal);
            if (code !== 0 && signal !== 'SIGINT' && signal !== 'SIGTERM') {
                resolve({ error: `tail exited with code ${code ?? 'unknown'}` });
                return;
            }
            resolve({ ok: true });
        });
    });
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath, spawnFn } = injections;
    const spawnImpl = spawnFn ?? nodeSpawn;
    const linesOpt = input.options.lines;
    const noFollow = input.options.noFollow === true;
    const logger = createCliLogger({
        verbose: !!input.options.verbose,
        json: !!input.options.json,
        prefix: '[lumpcode daemon-log]',
    });

    const scopeResult = await resolveDaemonCommandScope({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        daemonId: input.options.daemonId,
        lumpName: input.options.lumpName,
        logger,
    });
    if (!scopeResult.success) return scopeResult;
    const { daemonId, scopeLabel, paths } = scopeResult.data;
    const { logFilePath, projectName } = paths;

    try {
        await access(logFilePath);
    } catch {
        return failure({
            messages: [
                `No daemon log file for "${projectName}"${scopeLabel} at ${logFilePath}. Start the daemon first or check --daemonId.`,
            ],
        });
    }

    const tailArgs = buildTailArgs(logFilePath, linesOpt, noFollow);

    if (noFollow) {
        const tailResult = await runTailNoFollow(spawnImpl, tailArgs);
        if ('error' in tailResult) {
            return failure({ messages: [tailResult.error] });
        }
        const outputLines =
            tailResult.stdout === '' ? [] : tailResult.stdout.replace(/\n$/, '').split('\n');

        return success({
            messages: outputLines,
            data: {
                logFilePath,
                lines: outputLines,
                daemonId,
            },
        });
    }

    const followResult = await runTailFollow(spawnImpl, tailArgs);
    if ('error' in followResult) {
        return failure({ messages: [followResult.error] });
    }
    return success({
        messages: ['Stopped following daemon log.'],
    });
};

export const command = {
    handlerMaker,
    name: 'daemon-log',
    description:
        'Tail the background daemon log file (follows live by default). Pass --lines to limit initial output; pass --noFollow to print and exit. Pass --daemonId to select a daemon (default: global).',
    inputSchema,
} satisfies Command;
