import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import type { RunningDaemonInfo, RunningProjectDaemons } from '../listRunningProjectDaemons';

function stopLumpHint(lumpName: string): string {
    return `Run \`lumpcode stop --lumpName ${lumpName} --force\` first.`;
}

function stopGlobalHint(): string {
    return 'Run `lumpcode stop --force` first.';
}

function strategyLabel(info: Extract<RunningDaemonInfo, { meta: 'ok' }>): string {
    return info.workspaceStrategy;
}

function findCorruptDaemon(running: RunningProjectDaemons):
    | { kind: 'global'; info: Extract<RunningDaemonInfo, { meta: 'missing' | 'invalid' }> }
    | {
          kind: 'lump';
          lumpName: string;
          info: Extract<RunningDaemonInfo, { meta: 'missing' | 'invalid' }>;
      }
    | undefined {
    if (running.global !== undefined && running.global.meta !== 'ok') {
        return { kind: 'global', info: running.global };
    }
    for (const [lumpName, info] of Object.entries(running.lumps)) {
        if (info.meta !== 'ok') {
            return { kind: 'lump', lumpName, info };
        }
    }
    return undefined;
}

function findCheckoutLumpDaemon(
    running: RunningProjectDaemons,
): { lumpName: string; info: Extract<RunningDaemonInfo, { meta: 'ok' }> } | undefined {
    for (const [lumpName, info] of Object.entries(running.lumps)) {
        if (info.meta === 'ok' && info.workspaceStrategy === 'checkout') {
            return { lumpName, info };
        }
    }
    return undefined;
}

export type AssertDaemonStartAllowedFailure = {
    message: string;
    code?: 'daemonMetaCorrupt';
    reason?: 'missing' | 'invalid';
};

export function assertDaemonStartAllowed(input: {
    projectName: string;
    targetLumpName?: string;
    workspaceStrategy: WorkspaceStrategy;
    running: RunningProjectDaemons;
}): Success<void> | Failure<AssertDaemonStartAllowedFailure> {
    const { projectName, targetLumpName, workspaceStrategy, running } = input;

    const corrupt = findCorruptDaemon(running);
    if (corrupt !== undefined) {
        if (corrupt.kind === 'global') {
            return failure<AssertDaemonStartAllowedFailure>({
                code: 'daemonMetaCorrupt',
                reason: corrupt.info.meta,
                message:
                    `Cannot start: global daemon for "${projectName}" is running (pid ${corrupt.info.pid}) ` +
                    `but its meta is invalid (reason: ${corrupt.info.meta}). ${stopGlobalHint()}`,
            });
        }
        return failure<AssertDaemonStartAllowedFailure>({
            code: 'daemonMetaCorrupt',
            reason: corrupt.info.meta,
            message:
                `Cannot start: per-lump daemon for "${projectName}" lump "${corrupt.lumpName}" is running ` +
                `(pid ${corrupt.info.pid}) but its meta is invalid (reason: ${corrupt.info.meta}). ` +
                `${stopLumpHint(corrupt.lumpName)}`,
        });
    }

    if (running.global !== undefined) {
        const scope = targetLumpName ? 'Per-lump' : 'Global';
        // After corrupt check, global is always meta: 'ok'
        const global = running.global as Extract<RunningDaemonInfo, { meta: 'ok' }>;
        return failure({
            message:
                `${scope} daemon cannot start: global daemon already running for "${projectName}" ` +
                `(pid ${global.pid}, workspace strategy "${strategyLabel(global)}"). Run \`lumpcode stop\` first.`,
        });
    }

    if (!targetLumpName) {
        const lumpEntries = Object.entries(running.lumps);
        if (lumpEntries.length > 0) {
            const [lumpName, info] = lumpEntries[0] as [
                string,
                Extract<RunningDaemonInfo, { meta: 'ok' }>,
            ];
            return failure({
                message:
                    `Global daemon cannot start: per-lump daemon already running for "${projectName}" lump "${lumpName}" ` +
                    `(pid ${info.pid}, workspace strategy "${strategyLabel(info)}"). ` +
                    `Run \`lumpcode stop --lumpName ${lumpName}\` first.`,
            });
        }
        return success(undefined);
    }

    const sameLump = running.lumps[targetLumpName];
    if (sameLump !== undefined) {
        return failure({
            message:
                `Daemon already running for "${projectName}" lump "${targetLumpName}" (pid ${sameLump.pid}). ` +
                `Run \`lumpcode stop --lumpName ${targetLumpName}\` first.`,
        });
    }

    if (workspaceStrategy === 'checkout') {
        const otherLumps = Object.entries(running.lumps).filter(([name]) => name !== targetLumpName);
        if (otherLumps.length > 0) {
            const [otherLump, info] = otherLumps[0] as [
                string,
                Extract<RunningDaemonInfo, { meta: 'ok' }>,
            ];
            return failure({
                message:
                    `Only one daemon can run with workspace strategy "checkout". Per-lump daemon already running ` +
                    `for "${projectName}" lump "${otherLump}" (pid ${info.pid}). ` +
                    `Run \`lumpcode stop --lumpName ${otherLump}\` first.`,
            });
        }
        return success(undefined);
    }

    const checkoutLump = findCheckoutLumpDaemon(running);
    if (checkoutLump !== undefined) {
        const { lumpName, info } = checkoutLump;
        return failure({
            message:
                `A per-lump daemon for "${projectName}" lump "${lumpName}" is running with workspace strategy ` +
                `"checkout" (pid ${info.pid}). Stop it before starting another daemon with strategy "worktree". ` +
                `Run \`lumpcode stop --lumpName ${lumpName}\` first.`,
        });
    }

    return success(undefined);
}
