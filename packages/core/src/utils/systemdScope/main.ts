import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

import type { Failure, Success } from '../../types';
import { failure } from '../failure';
import { success } from '../success';

const execFileAsync = promisify(execFile);

const PROBE_TIMEOUT_MS = 10_000;
const SYSTEMCTL_TIMEOUT_MS = 10_000;
const KILL_WAIT_MS = 5000;
const POLL_MS = 50;
/** systemd caps unit names at 255 characters, suffix included. */
const UNIT_NAME_PREFIX_MAX = 200;

export type SystemdScopeSupport =
    | { available: true }
    | { available: false; reason: string };

let supportProbe: Promise<SystemdScopeSupport> | undefined;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function execErrorDetail(error: unknown): string {
    const stderr = error && typeof error === 'object' && 'stderr' in error
        ? String((error as { stderr?: unknown }).stderr ?? '').trim()
        : '';
    if (stderr) return stderr;
    return error instanceof Error ? error.message : String(error);
}

async function probeSystemdScope(): Promise<SystemdScopeSupport> {
    if (process.platform !== 'linux') {
        return { available: false, reason: `systemd is not available on ${process.platform}` };
    }
    try {
        await execFileAsync(
            'systemd-run',
            ['--user', '--scope', '--quiet', '--collect', '--', 'true'],
            { timeout: PROBE_TIMEOUT_MS },
        );
        return { available: true };
    } catch (error) {
        return { available: false, reason: execErrorDetail(error) };
    }
}

/**
 * Whether `systemd-run --user --scope` works for this process. Probed once
 * per process by starting a throwaway scope.
 */
export function detectSystemdScope(): Promise<SystemdScopeSupport> {
    supportProbe ??= probeSystemdScope();
    return supportProbe;
}

function unitNamePart(value: string): string {
    return value.replace(/[^A-Za-z0-9_.:-]+/g, '_');
}

/**
 * `lump-<lump>-<context>-<step>-<random>.scope`. The random suffix keeps a
 * leftover unit from an earlier run from blocking the name.
 */
export function systemdScopeUnitName(input: {
    lumpName?: string;
    contextName: string;
    stepIndex: number | number[];
}): string {
    const { lumpName, contextName, stepIndex } = input;
    const step = Array.isArray(stepIndex) ? stepIndex.join('.') : String(stepIndex);
    const parts = ['lump', ...(lumpName ? [lumpName] : []), contextName, step].map(unitNamePart);
    const prefix = parts.join('-').slice(0, UNIT_NAME_PREFIX_MAX);
    return `${prefix}-${randomBytes(3).toString('hex')}.scope`;
}

/** Wraps a resolved command so it runs in its own transient user scope (cgroup). */
export function wrapInSystemdScope(input: {
    executable: string;
    args: string[];
    unitName: string;
}): { executable: string; args: string[] } {
    const { executable, args, unitName } = input;
    return {
        executable: 'systemd-run',
        args: ['--user', '--scope', '--quiet', '--collect', `--unit=${unitName}`, '--', executable, ...args],
    };
}

async function isScopeActive(unitName: string): Promise<boolean> {
    const { stdout } = await execFileAsync(
        'systemctl',
        ['--user', 'show', '--property=ActiveState', '--value', unitName],
        { timeout: SYSTEMCTL_TIMEOUT_MS },
    );
    const state = stdout.trim();
    return state === 'active' || state === 'activating' || state === 'deactivating';
}

async function signalScope(unitName: string, signal: NodeJS.Signals): Promise<void> {
    try {
        await execFileAsync(
            'systemctl',
            ['--user', 'kill', `--signal=${signal}`, unitName],
            { timeout: SYSTEMCTL_TIMEOUT_MS },
        );
    } catch (error) {
        // The scope disappears on its own once its last process exits.
        if (await isScopeActive(unitName)) throw error;
    }
}

async function waitForScopeGone(unitName: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!(await isScopeActive(unitName))) return true;
        await sleep(POLL_MS);
    }
    return !(await isScopeActive(unitName));
}

/**
 * Kills every process left in the scope, including orphans that were
 * reparented out of the step's process tree. `graceMs > 0` sends SIGTERM
 * first, then SIGKILL after the grace window.
 */
export async function killSystemdScope(input: {
    unitName: string;
    graceMs?: number;
}): Promise<Success<void> | Failure<string>> {
    const { unitName, graceMs = 0 } = input;
    try {
        if (!(await isScopeActive(unitName))) return success(undefined);
        if (graceMs > 0) {
            await signalScope(unitName, 'SIGTERM');
            if (await waitForScopeGone(unitName, graceMs)) return success(undefined);
        }
        await signalScope(unitName, 'SIGKILL');
        if (await waitForScopeGone(unitName, KILL_WAIT_MS)) return success(undefined);
        return failure(`Processes in ${unitName} survived SIGKILL`);
    } catch (error) {
        return failure(`Could not kill ${unitName}: ${execErrorDetail(error)}`);
    }
}
