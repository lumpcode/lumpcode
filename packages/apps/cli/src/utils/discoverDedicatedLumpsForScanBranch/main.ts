import type { Failure, Logger, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import { DISCOVERY_SCAN_LOCK_HOLDER } from '../../consts';
import type { LocalConfig } from '../../types/LocalConfig';
import { discoverLoadableLumps, type LoadableLump } from '../discoverLoadableLumpNames';
import { preflightDiscoveryBranchWithLock } from '../preflightDiscoveryBranchWithLock';
import { resolveLumpBranches } from '../resolveLumpBranches';
import { isWorkspacePathBusyError } from '../workspacePathLock';

export async function discoverDedicatedLumpsForScanBranch(input: {
    scanBranch: string;
    sourceProjectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    localConfig: LocalConfig;
    logger: Logger;
}): Promise<Success<LoadableLump[]> | Failure<string>> {
    const {
        scanBranch,
        sourceProjectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        localConfig,
        logger,
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
            const loadableLumps = await discoverLoadableLumps({ localConfigFolderPath, logger });
            const matchingLumps: LoadableLump[] = [];

            for (const lump of loadableLumps) {
                const branches = resolveLumpBranches({
                    lumpConfig: lump.jsConfig,
                    localConfig,
                });
                if (branches.resolvedDiscoveryBranch === scanBranch) {
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
