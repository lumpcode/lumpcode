import { spawn as nodeSpawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';

import { failure, nodeErrnoCode, success, type Failure, type Success } from '@lumpcode/core';

export const DEFAULT_TAIL_LINES = 10;

export async function tailFile(input: {
    filePath: string;
    lines: number;
    follow: boolean;
    spawnFn?: typeof nodeSpawn;
}): Promise<Success<{ lines: string[] }> | Success<{ followed: true }> | Failure<string>> {
    const { filePath, lines, follow, spawnFn } = input;
    try {
        await access(filePath);
    } catch (error: unknown) {
        if (nodeErrnoCode(error) === 'ENOENT') {
            return failure(`File not found: ${filePath}`);
        }
        return failure(`Cannot read file ${filePath}: ${String(error)}`);
    }

    if (!follow) {
        return readFileLines({ filePath, lines });
    }

    const spawnImpl = spawnFn ?? nodeSpawn;
    const args = buildFollowArgs(filePath, lines);
    const followResult = await runTailFollow({
        spawnFn: spawnImpl,
        args,
        attachProcessSignals: spawnFn === undefined,
    });
    if ('error' in followResult) {
        return failure(followResult.error);
    }
    return success<{ followed: true }>({ followed: true });
}

function buildFollowArgs(filePath: string, lines: number): string[] {
    const count = lines === 0 ? '+1' : String(lines);
    return ['-n', count, '-f', filePath];
}

function splitOutputLines(text: string): string[] {
    return text === '' ? [] : text.replace(/\n$/, '').split('\n');
}

async function readFileLines(input: {
    filePath: string;
    lines: number;
}): Promise<Success<{ lines: string[] }> | Failure<string>> {
    let text: string;
    try {
        text = await readFile(input.filePath, 'utf-8');
    } catch (error: unknown) {
        return failure(`Cannot read file ${input.filePath}: ${String(error)}`);
    }
    const allLines = splitOutputLines(text);
    const lines = input.lines === 0 ? allLines : allLines.slice(-input.lines);
    return success({ lines });
}

function runTailFollow(input: {
    spawnFn: typeof nodeSpawn;
    args: string[];
    attachProcessSignals: boolean;
}): Promise<{ ok: true } | { error: string }> {
    const { spawnFn, args, attachProcessSignals } = input;
    return new Promise((resolve) => {
        const child = spawnFn('tail', args, { stdio: ['ignore', 'inherit', 'inherit'] });
        const onSignal = () => {
            child.kill('SIGTERM');
        };
        const detachSignals = () => {
            if (!attachProcessSignals) return;
            process.off('SIGINT', onSignal);
            process.off('SIGTERM', onSignal);
        };
        if (attachProcessSignals) {
            process.once('SIGINT', onSignal);
            process.once('SIGTERM', onSignal);
        }
        child.on('error', (err) => {
            detachSignals();
            resolve({ error: `Could not run tail: ${err.message}` });
        });
        child.on('close', (code, signal) => {
            detachSignals();
            if (code !== 0 && signal !== 'SIGINT' && signal !== 'SIGTERM') {
                resolve({ error: `tail exited with code ${code ?? 'unknown'}` });
                return;
            }
            resolve({ ok: true });
        });
    });
}
