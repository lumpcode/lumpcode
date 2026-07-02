import type { Failure, Logger, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';
import { discoverLoadableLumps, type LoadableLump } from '../discoverLoadableLumpNames';
import { resolveLumpBranches } from '../resolveLumpBranches';
import { runProjectPreflight } from '../runProjectPreflight';

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

    const preflightResult = await runProjectPreflight({
        sourceProjectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        localConfig,
        targetBranch: scanBranch,
    });
    if (!preflightResult.success) {
        return failure(preflightResult.data);
    }

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
}
