import { spawn } from 'node:child_process';

import { subprocessEnv } from './subprocessEnv';

export type CliJsonOutput = { messages: string[]; data?: Record<string, unknown> };
export type RunCliResult = { code: number | null; stdout: string; stderr: string; json: CliJsonOutput };

/** Spawns the CLI with an isolated HOME, timeout, and parsed `--json` envelope. */
export async function runCli(input: {
    executable: string;
    projectRoot: string;
    homeDir: string;
    args: string[];
    timeoutMs?: number;
    pathPrefix?: string;
}): Promise<RunCliResult> {
    const { executable, projectRoot, homeDir, args, timeoutMs = 120_000, pathPrefix } = input;
    return new Promise((resolve, reject) => {
        const child = spawn(executable, args, {
            cwd: projectRoot,
            env: subprocessEnv(homeDir, { pathPrefix }),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
        child.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
        const timer = setTimeout(() => {
            if (process.platform === 'win32') {
                child.kill();
            } else {
                child.kill('SIGKILL');
            }
            reject(new Error(`CLI timeout: ${args.join(' ')}\n${stderr.slice(-500)}`));
        }, timeoutMs);
        child.on('error', (e) => { clearTimeout(timer); reject(e); });
        child.on('close', (code) => {
            clearTimeout(timer);
            try {
                resolve({
                    code,
                    stdout,
                    stderr,
                    json: parseCliJson({ stdout, stderr, exitCode: code }),
                });
            } catch (err) {
                reject(err);
            }
        });
    });
}

function isCliJsonOutput(value: unknown): value is CliJsonOutput {
    return (
        typeof value === 'object' &&
        value !== null &&
        Array.isArray((value as CliJsonOutput).messages)
    );
}

/** `--json` emits a single JSON line on stdout (success) or stderr (failure). */
export function parseCliJson(input: {
    stdout: string;
    stderr: string;
    exitCode?: number | null;
}): CliJsonOutput {
    const lines = `${input.stdout}\n${input.stderr}`
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line.startsWith('{')) continue;
        try {
            const parsed: unknown = JSON.parse(line);
            if (isCliJsonOutput(parsed)) return parsed;
        } catch {
            // not a complete envelope on this line
        }
    }

    if (input.exitCode === 0 && lines.length > 0) {
        return { messages: lines };
    }

    throw new Error(
        `CLI --json: expected one JSON envelope line in stdout/stderr\n${tail(`${input.stdout}\n${input.stderr}`)}`,
    );
}

/** Returns the last 20 non-empty lines of CLI output for failure messages. */
export function tail(text: string): string {
    return text.trim().split('\n').slice(-20).join('\n');
}
