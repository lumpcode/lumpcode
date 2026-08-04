import * as os from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';

import {
    daemonMetaPath,
    daemonPidPath,
    daemonsDirPath,
    isDaemonMidRun,
    pollUntil,
    pollUntilPathExists,
    readDaemonMeta,
} from '../../utils';
import type { E2eProject } from './createE2eProject';
import { e2eCliInvocation, runE2eCli } from './e2eCli';
import { waitForRemoteMarker } from './markerAssertions';
import type { RunCliResult } from './runCli';
import { subprocessEnv } from './subprocessEnv';

/** PID and meta file paths for a global or per-lump daemon under the project's isolated HOME. */
export function daemonPathsForProject(project: E2eProject, lumpName?: string) {
    const daemonsDir = daemonsDirPath({ globalConfigFolderPath: project.globalConfigFolderPath });
    const base = { daemonsDir, projectName: project.projectName, lumpName };
    return {
        pidFilePath: daemonPidPath(base),
        metaFilePath: daemonMetaPath(base),
    };
}

/** Polls until a file exists or the timeout elapses. */
export async function waitForPath(filePath: string, timeoutMs = 60_000): Promise<void> {
    await pollUntilPathExists({ filePath, timeoutMs, intervalMs: 100 });
}

/** Guards against accidentally pointing e2e runs at the real user profile directory. */
export function assertHomeIsolated(project: E2eProject): void {
    const realHome = os.homedir();
    if (project.homeDir === realHome) {
        throw new Error('E2E homeDir must not equal os.homedir()');
    }
    if (process.env.HOME && project.homeDir === process.env.HOME) {
        throw new Error('E2E homeDir must not equal process.env.HOME');
    }
    if (process.env.USERPROFILE && project.homeDir === process.env.USERPROFILE) {
        throw new Error('E2E homeDir must not equal process.env.USERPROFILE');
    }
}

/**
 * Polls daemon meta until a lump run has started (mid-run) and then finished
 * (idle). Mid-run uses {@link isDaemonMidRun}. Avoids racing `stop` against the
 * pre-first-tick window where meta looks idle simply because work has not begun yet.
 *
 * E1 (parallel-global-daemon-worktree): mid-run via `inFlightLumpCount` with legacy `busy` fallback.
 */
export async function waitForDaemonIdle(input: {
    metaFilePath: string;
    timeoutMs?: number;
}): Promise<void> {
    let sawMidRun = false;
    await pollUntil({
        timeoutMs: input.timeoutMs ?? 120_000,
        intervalMs: 100,
        timeoutError: `Timed out waiting for daemon mid-run→idle at ${input.metaFilePath}`,
        poll: async () => {
            const metaResult = await readDaemonMeta(input.metaFilePath);
            if (!metaResult.success) return undefined;

            if (isDaemonMidRun(metaResult.data)) {
                sawMidRun = true;
                return undefined;
            }
            return sawMidRun ? true : undefined;
        },
    });
}

/** Treats `stop` responses that mean no daemon is running as success during teardown. */
function isDaemonNotRunningStop(result: RunCliResult): boolean {
    const msg = result.json.messages.join(' ');
    return /no daemon pid file|already gone|not running|invalid pid|removed stale file/i.test(msg);
}

/** Runs `lumpcode stop --force` and ignores "already stopped" outcomes; throws on unexpected failures. */
export async function stopDaemonSafely(input: {
    project: E2eProject;
    runCli: (args: string[]) => Promise<RunCliResult>;
    lumpName?: string;
}): Promise<void> {
    const args = [
        'stop',
        '--json',
        '--force',
        ...(input.lumpName ? ['--lumpName', input.lumpName] : []),
    ];
    const result = await input.runCli(args);
    if (result.code === 0) return;
    if (isDaemonNotRunningStop(result)) return;
    throw new Error(
        `stop failed: ${result.json.messages.join(' ')}\n${result.stderr || result.stdout}`,
    );
}

/** Foreground `start` writes its PID; `stop` signals that process — same as the harness spawn child. */
function waitForChildExitAfterStop(child: ChildProcess, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
        if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
        }
        const timer = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) {
                child.kill();
            }
            reject(
                new Error(
                    `Foreground daemon (pid ${child.pid}) did not exit within ${timeoutMs}ms after lumpcode stop`,
                ),
            );
        }, timeoutMs);
        child.once('close', () => {
            clearTimeout(timer);
            resolve();
        });
    });
}

export type ForegroundDaemonOutput = { stdout: string; stderr: string };

/**
 * Starts a foreground daemon, waits for remote e2e markers, then stops the daemon
 * and waits for the spawn child to exit.
 */
export async function runForegroundUntilMarkers(input: {
    project: E2eProject;
    lumpName?: string;
    waitFor: { lumpName: string; contextName: string }[];
}): Promise<ForegroundDaemonOutput> {
    const args = [
        'start',
        '--foreground',
        '--cronSetup',
        '*/1 * * * *',
        ...(input.lumpName ? ['--lumpName', input.lumpName] : []),
    ];
    const invocation = e2eCliInvocation();
    const child = spawn(invocation.executable, [...invocation.argsPrefix, ...args], {
        cwd: input.project.projectRoot,
        env: subprocessEnv(input.project.homeDir),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    try {
        await Promise.all(
            input.waitFor.map((target) =>
                waitForRemoteMarker({
                    remoteDir: input.project.remoteDir,
                    lumpName: target.lumpName,
                    contextName: target.contextName,
                    timeoutMs: 120_000,
                }),
            ),
        );
        return { stdout, stderr };
    } finally {
        await stopDaemonSafely({
            project: input.project,
            runCli: (stopArgs) => runE2eCli({ project: input.project, args: stopArgs }),
            lumpName: input.lumpName,
        });
        await waitForChildExitAfterStop(child, 15_000);
        if (process.platform === 'win32') {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
}
