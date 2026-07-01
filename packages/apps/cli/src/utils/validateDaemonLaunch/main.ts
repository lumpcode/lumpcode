import type { Failure, Logger, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';
import type { LumpJsConfig } from '../../types/LumpJsConfig';
import { discoverLoadableLumps } from '../discoverLoadableLumpNames';
import { getJsConfigFromLumpName } from '../getJsConfigFromLumpName';
import { resolvePrimaryBranches } from '../resolvePrimaryBranches';
import { resolveLumpBranches } from '../resolveLumpBranches';
import { validateLumpDiscoveryBranchAllowlist } from '../validateLumpDiscoveryBranchAllowlist';

type LumpRegistryEntry = {
    lumpName: string;
    jsConfig: LumpJsConfig;
    resolvedDiscoveryBranch: string;
    resolvedBaseBranch: string;
};

function parseDependsOnLumpName(ref: string): string | undefined {
    const slash = ref.indexOf('/');
    return slash === -1 ? undefined : ref.slice(0, slash);
}

type LumpConfigWithOptionalDeps = LumpJsConfig & {
    dependsOnContexts?: string[];
};

function collectCrossLumpDependsOnRefs(jsConfig: LumpJsConfig): string[] {
    const refs: string[] = [];
    const topLevel = (jsConfig as LumpConfigWithOptionalDeps).dependsOnContexts;
    if (topLevel?.length) {
        for (const ref of topLevel) {
            if (ref.includes('/')) refs.push(ref);
        }
    }
    return refs;
}

function warnCrossLumpBaseBranchMismatches(input: {
    lumps: LumpRegistryEntry[];
    logger: Logger;
}): void {
    const byName = new Map(input.lumps.map((entry) => [entry.lumpName, entry]));
    for (const consumer of input.lumps) {
        const depRefs = collectCrossLumpDependsOnRefs(consumer.jsConfig);
        if (!depRefs.length) continue;
        for (const depRef of depRefs) {
            const providerName = parseDependsOnLumpName(depRef);
            if (!providerName) continue;
            const provider = byName.get(providerName);
            if (!provider) continue;
            if (provider.resolvedBaseBranch !== consumer.resolvedBaseBranch) {
                input.logger.warn(
                    `cross-lump dependsOnContexts: lump "${consumer.lumpName}" (baseBranch ` +
                        `"${consumer.resolvedBaseBranch}") depends on "${depRef}" but lump ` +
                        `"${providerName}" uses baseBranch "${provider.resolvedBaseBranch}"`,
                );
            }
        }
    }
}

export async function validateDaemonLaunch(input: {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    localConfig: LocalConfig;
    lumpNameOpt?: string;
    logger: Logger;
}): Promise<Success<void> | Failure<string>> {
    const {
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        localConfig,
        lumpNameOpt,
        logger,
    } = input;

    const effectivePrimaryBranches = resolvePrimaryBranches(localConfig);

    if (lumpNameOpt) {
        const jsConfResult = await getJsConfigFromLumpName({ lumpName: lumpNameOpt, localConfigFolderPath });
        if (!jsConfResult.success) {
            return failure(`Lump "${lumpNameOpt}": ${jsConfResult.data}`);
        }
        const { resolvedDiscoveryBranch } = resolveLumpBranches({
            lumpConfig: jsConfResult.data,
            localConfig,
        });
        return validateLumpDiscoveryBranchAllowlist({
            mode: localConfig.mode,
            lumpName: lumpNameOpt,
            resolvedDiscoveryBranch,
            effectivePrimaryBranches,
        });
    }

    if (localConfig.mode !== 'dedicated') {
        return success(undefined);
    }

    const loadableLumps = await discoverLoadableLumps({ localConfigFolderPath, logger });

    const registry: LumpRegistryEntry[] = [];

    for (const scanBranch of effectivePrimaryBranches) {
        const seenOnBranch = new Set<string>();

        for (const { lumpName, jsConfig } of loadableLumps) {
            const branches = resolveLumpBranches({
                lumpConfig: jsConfig,
                localConfig,
            });

            const allowlistResult = validateLumpDiscoveryBranchAllowlist({
                mode: localConfig.mode,
                lumpName,
                resolvedDiscoveryBranch: branches.resolvedDiscoveryBranch,
                effectivePrimaryBranches,
            });
            if (!allowlistResult.success) {
                return allowlistResult;
            }

            if (branches.resolvedDiscoveryBranch !== scanBranch) {
                continue;
            }

            if (seenOnBranch.has(lumpName)) {
                return failure(
                    `Duplicate lump name "${lumpName}" on primary branch "${scanBranch}"`,
                );
            }
            seenOnBranch.add(lumpName);

            registry.push({
                lumpName,
                jsConfig,
                resolvedDiscoveryBranch: branches.resolvedDiscoveryBranch,
                resolvedBaseBranch: branches.resolvedBaseBranch,
            });
        }
    }

    warnCrossLumpBaseBranchMismatches({ lumps: registry, logger });
    return success(undefined);
}
