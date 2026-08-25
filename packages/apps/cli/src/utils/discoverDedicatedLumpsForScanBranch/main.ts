import type { Failure, Logger, Success } from '@lumpcode/core';
import { execBinary, failure, success } from '@lumpcode/core';

import { DISCOVERY_SCAN_LOCK_HOLDER, REFRESH_COMMAND_TIMEOUT_MS } from '../../consts';
import type { LocalConfig } from '../../types/LocalConfig';
import { discoverLoadableLumps, type LoadableLump } from '../discoverLoadableLumpNames';
import { preflightDiscoveryBranchWithLock } from '../preflightDiscoveryBranchWithLock';
import {
    discoveryRulesMatchScanBranch,
    normalizeDiscoveryRules,
} from '../resolveLumpBranches';
import { resolvePrimaryBranch } from '../resolvePrimaryBranches';
import { isWorkspacePathBusyError } from '../workspacePathLock';

export async function discoverDedicatedLumpsForScanBranch(input: {
    scanBranch: string;
    sourceProjectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    localConfig: LocalConfig;
    logger: Logger;
    refreshCommand?: string;
}): Promise<Success<LoadableLump[]> | Failure<string>> {
    const {
        scanBranch,
        sourceProjectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        localConfig,
        logger,
        refreshCommand,
    } = input;

    const discoveryResult = await preflightDiscoveryBranchWithLock({
        sourceProjectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        localConfig,
        discoveryBranch: scanBranch,
        lumpName: DISCOVERY_SCAN_LOCK_HOLDER,
        lockMode: 'wait',
        logger,
        holdForRun: false,
        fn: async () => {
            if (refreshCommand) {
                logger.info(`refreshCommand on "${scanBranch}": ${refreshCommand}`);
                const isWin = process.platform === 'win32';
                const refreshResult = await execBinary({
                    binaryPath: isWin ? 'cmd.exe' : '/bin/sh',
                    args: isWin ? ['/d', '/s', '/c', refreshCommand] : ['-c', refreshCommand],
                    cwd: sourceProjectRoot,
                    timeoutMillis: REFRESH_COMMAND_TIMEOUT_MS,
                    stdio: 'ignore',
                });
                if (!refreshResult.success) {
                    return failure(
                        `refreshCommand failed on "${scanBranch}": ${refreshResult.data.message}`,
                    );
                }
                logger.info(`refreshCommand on "${scanBranch}": ok`);
            }

            let primaryBranch: string;
            try {
                primaryBranch = resolvePrimaryBranch(localConfig, logger);
            } catch (err) {
                return failure(err instanceof Error ? err.message : String(err));
            }

            const loadableLumps = await discoverLoadableLumps({ localConfigFolderPath, logger });
            const matchingLumps: LoadableLump[] = [];

            for (const lump of loadableLumps) {
                const rulesResult = normalizeDiscoveryRules({
                    lumpConfig: lump.jsConfig,
                    primaryBranch,
                });
                if (!rulesResult.success) {
                    logger.warn(`lump "${lump.lumpName}": ${rulesResult.data}; skipping`);
                    continue;
                }
                if (
                    discoveryRulesMatchScanBranch({
                        rules: rulesResult.data,
                        scanBranch,
                    })
                ) {
                    matchingLumps.push(lump);
                }
            }

            return success(matchingLumps);
        },
    });

    if (!discoveryResult.success) {
        const err = discoveryResult.data;
        if (typeof err === 'string') {
            return failure(err);
        }
        if (isWorkspacePathBusyError(err)) {
            return failure(err.message);
        }
        return failure(String(err));
    }

    return success(discoveryResult.data.data);
}
