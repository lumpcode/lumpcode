import { expect } from 'vitest';
import type { ContextStatus } from '@lumpcode/core';

import type { ContextStatusRecord } from '../../types/ContextStatusRecord';
import type { RunLumpFromJsConfigSuccess } from '../../utils/runLumpFromJsConfig';
import { tail, type RunCliResult } from './runCli';

function cliJsonDetail(result: RunCliResult): string {
    return tail(result.stderr || result.stdout);
}

/** Extracts `json.data` or throws with CLI output for debugging. */
function requireJsonData(result: RunCliResult, label: string): Record<string, unknown> {
    const data = result.json.data;
    if (!data || typeof data !== 'object') {
        throw new Error(`${label}: missing json.data\n${cliJsonDetail(result)}`);
    }
    return data;
}

/** Successful `run --json` payload: `skipped: false` with executed context names. */
function isRunSuccessData(data: Record<string, unknown>): data is { skipped: false; result: { contextNames: string[] } } {
    if (data.skipped !== false || typeof data.result !== 'object' || data.result === null) return false;
    const result = data.result as { contextNames?: unknown };
    return Array.isArray(result.contextNames);
}

function isRunSkippedTooManyOpenBranches(
    data: Record<string, unknown>,
): data is Extract<RunLumpFromJsConfigSuccess, { skipped: true }> {
    return (
        data.skipped === true &&
        data.reason === 'tooManyOpenBranches' &&
        typeof data.reasonDetail === 'string' &&
        typeof data.openBranchCount === 'number' &&
        typeof data.maximumNumberOfConcurrentBranches === 'number'
    );
}

function isLumpStatusData(
    data: Record<string, unknown>,
): data is { statusByLump: Record<string, ContextStatusRecord> } {
    const statusByLump = data.statusByLump;
    return typeof statusByLump === 'object' && statusByLump !== null && !Array.isArray(statusByLump);
}

function isDaemonStatusData(data: Record<string, unknown>): data is { running: boolean } {
    return typeof data.running === 'boolean';
}

/** Asserts `run --json` returned the given executed context names. */
export function expectRunContextNames(result: RunCliResult, expected: string[]): void {
    const data = requireJsonData(result, 'run contextNames');
    if (!isRunSuccessData(data)) {
        throw new Error(`run contextNames: expected successful run payload\n${cliJsonDetail(result)}`);
    }
    expect(data.result.contextNames).toEqual(expected);
}

/** Asserts `run --json` skipped because `maximumNumberOfConcurrentBranches` was reached. */
export function expectRunSkippedTooManyOpenBranches(result: RunCliResult): void {
    const data = requireJsonData(result, 'run skipped');
    if (!isRunSkippedTooManyOpenBranches(data)) {
        throw new Error(
            `run skipped: expected { skipped: true, reason: 'tooManyOpenBranches', ... }\n${cliJsonDetail(result)}`,
        );
    }
}

/** Asserts `lump-status --json` reports the expected status for one context. */
export function expectLumpStatus(
    result: RunCliResult,
    input: { lumpName: string; contextName: string; status: ContextStatus },
): void {
    const data = requireJsonData(result, 'lump-status');
    if (!isLumpStatusData(data)) {
        throw new Error(`lump-status: expected statusByLump\n${cliJsonDetail(result)}`);
    }
    const lump = data.statusByLump[input.lumpName];
    if (!lump?.[input.contextName]) {
        throw new Error(
            `lump-status: missing ${input.lumpName}/${input.contextName}\n${cliJsonDetail(result)}`,
        );
    }
    expect(lump[input.contextName].status).toBe(input.status);
}

/** Asserts `daemon-status --json` reports the expected running flag. */
export function expectDaemonRunning(result: RunCliResult, running: boolean): void {
    const data = requireJsonData(result, 'daemon-status');
    if (!isDaemonStatusData(data)) {
        throw new Error(`daemon-status: expected running boolean\n${cliJsonDetail(result)}`);
    }
    expect(data.running).toBe(running);
}
