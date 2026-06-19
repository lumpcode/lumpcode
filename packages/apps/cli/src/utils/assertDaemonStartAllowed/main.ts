import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import type { RunningDaemonInfo, RunningProjectDaemons } from '../listRunningProjectDaemons';

function stopLumpHint(projectName: string, lumpName: string): string {
    return `Run \`lumpcode stop --lumpName ${lumpName}\` first.`;
}

function findCheckoutLumpDaemon(
    running: RunningProjectDaemons,
): { lumpName: string; info: RunningDaemonInfo } | undefined {
    for (const [lumpName, info] of Object.entries(running.lumps)) {
        if (info.workspaceStrategy === 'checkout') {
            return { lumpName, info };
        }
    }
    return undefined;
}

export function assertDaemonStartAllowed(input: {
    projectName: string;
    targetLumpName?: string;
    workspaceStrategy: WorkspaceStrategy;
    running: RunningProjectDaemons;
}): Success<void> | Failure<string> {
    const { projectName, targetLumpName, workspaceStrategy, running } = input;

    if (running.global !== undefined) {
        const scope = targetLumpName ? 'Per-lump' : 'Global';
        return failure(
            `${scope} daemon cannot start: global daemon already running for "${projectName}" (pid ${running.global.pid}, workspace strategy "${running.global.workspaceStrategy}"). Run \`lumpcode stop\` first.`,
        );
    }

    if (!targetLumpName) {
        const lumpEntries = Object.entries(running.lumps);
        if (lumpEntries.length > 0) {
            const [lumpName, info] = lumpEntries[0];
            return failure(
                `Global daemon cannot start: per-lump daemon already running for "${projectName}" lump "${lumpName}" (pid ${info.pid}, workspace strategy "${info.workspaceStrategy}"). ${stopLumpHint(projectName, lumpName)}`,
            );
        }
        return success(undefined);
    }

    const sameLump = running.lumps[targetLumpName];
    if (sameLump !== undefined) {
        return failure(
            `Daemon already running for "${projectName}" lump "${targetLumpName}" (pid ${sameLump.pid}). ${stopLumpHint(projectName, targetLumpName)}`,
        );
    }

    if (workspaceStrategy === 'checkout') {
        const otherLumps = Object.entries(running.lumps).filter(([name]) => name !== targetLumpName);
        if (otherLumps.length > 0) {
            const [otherLump, info] = otherLumps[0];
            return failure(
                `Only one daemon can run with workspace strategy "checkout". Per-lump daemon already running for "${projectName}" lump "${otherLump}" (pid ${info.pid}). ${stopLumpHint(projectName, otherLump)}`,
            );
        }
        return success(undefined);
    }

    const checkoutLump = findCheckoutLumpDaemon(running);
    if (checkoutLump !== undefined) {
        const { lumpName, info } = checkoutLump;
        return failure(
            `A per-lump daemon for "${projectName}" lump "${lumpName}" is running with workspace strategy "checkout" (pid ${info.pid}). Stop it before starting another daemon with strategy "worktree". ${stopLumpHint(projectName, lumpName)}`,
        );
    }

    return success(undefined);
}
