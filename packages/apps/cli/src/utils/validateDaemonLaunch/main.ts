import type { Failure, Logger, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';
import type { LumpJsConfig } from '../../types/LumpJsConfig';
import { discoverDedicatedLumpsForScanBranch } from '../discoverDedicatedLumpsForScanBranch';
import { discoverLoadableLumps } from '../discoverLoadableLumpNames';
import { expandPrimaryBranches } from '../expandPrimaryBranches';
import { resolveEffectiveDiscoveryBranch } from '../resolveEffectiveDiscoveryBranch';
import { resolvePrimaryBranch, resolvePrimaryBranches } from '../resolvePrimaryBranches';
import {
    normalizeDiscoveryRules,
    resolveLumpBaseBranch,
} from '../resolveLumpBranches';
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
    effectiveDiscoveryBranch?: string;
    discoveryBranchOpt?: string;
    logger: Logger;
}): Promise<Success<void> | Failure<string>> {
    const {
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        localConfig,
        lumpNameOpt,
        effectiveDiscoveryBranch: providedDiscoveryBranch,
        discoveryBranchOpt,
        logger,
    } = input;

    let effectivePrimaryBranches: string[];
    try {
        effectivePrimaryBranches = resolvePrimaryBranches(localConfig);
        // Fail all-glob configs early (V1).
        resolvePrimaryBranch(localConfig);
    } catch (err) {
        return failure(err instanceof Error ? err.message : String(err));
    }

    if (lumpNameOpt) {
        if (providedDiscoveryBranch !== undefined) {
            return validateLumpDiscoveryBranchAllowlist({
                mode: localConfig.mode,
                lumpName: lumpNameOpt,
                resolvedDiscoveryBranch: providedDiscoveryBranch,
                effectivePrimaryBranches,
            });
        }

        const discoveryResult = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt,
            lumpName: lumpNameOpt,
            localConfigFolderPath,
            localConfig,
            logger,
        });
        if (!discoveryResult.success) {
            return failure(discoveryResult.data);
        }
        return success(undefined);
    }

    if (discoveryBranchOpt?.trim()) {
        logger.info('--discoveryBranch has no effect on a global daemon; ignoring.');
    }

    if (localConfig.mode !== 'dedicated') {
        return success(undefined);
    }

    const expandResult = await expandPrimaryBranches({
        localConfig,
        cwd: projectRoot,
        logger,
    });
    if (!expandResult.success) {
        return failure(expandResult.data);
    }
    const scanBranches = expandResult.data;

    let primaryBranch: string;
    try {
        primaryBranch = resolvePrimaryBranch(localConfig);
    } catch (err) {
        return failure(err instanceof Error ? err.message : String(err));
    }

    // Validate every loadable lump's configured discovery rules against unexpanded primaries (V3).
    // Use a quiet logger so invalid-dir warns are not duplicated when scan discovery reloads.
    const quietLogger: Logger = {
        ...logger,
        warn: () => {},
        info: () => {},
        verbose: () => {},
        error: () => {},
        child: () => quietLogger,
    };
    const allLoadable = await discoverLoadableLumps({
        localConfigFolderPath,
        logger: quietLogger,
    });
    for (const { lumpName, jsConfig } of allLoadable) {
        const rulesResult = normalizeDiscoveryRules({
            lumpConfig: jsConfig,
            primaryBranch,
        });
        if (!rulesResult.success) {
            return failure(`Lump "${lumpName}": ${rulesResult.data}`);
        }
        for (const rule of rulesResult.data) {
            const allowlistResult = validateLumpDiscoveryBranchAllowlist({
                mode: localConfig.mode,
                lumpName,
                resolvedDiscoveryBranch: rule,
                effectivePrimaryBranches,
            });
            if (!allowlistResult.success) {
                return failure(allowlistResult.data);
            }
        }
    }

    const registry: LumpRegistryEntry[] = [];

    for (const scanBranch of scanBranches) {
        const discoverResult = await discoverDedicatedLumpsForScanBranch({
            scanBranch,
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig,
            logger,
        });
        if (!discoverResult.success) {
            return failure(`Discovery branch "${scanBranch}": ${discoverResult.data}`);
        }

        const seenOnBranch = new Set<string>();

        for (const { lumpName, jsConfig } of discoverResult.data) {
            if (seenOnBranch.has(lumpName)) {
                return failure(
                    `Duplicate lump name "${lumpName}" on primary branch "${scanBranch}"`,
                );
            }
            seenOnBranch.add(lumpName);

            const resolvedBaseBranch = resolveLumpBaseBranch({
                lumpConfig: jsConfig,
                primaryBranch,
                mode: localConfig.mode,
                effectiveDiscoveryBranch: scanBranch,
            });

            registry.push({
                lumpName,
                jsConfig,
                resolvedDiscoveryBranch: scanBranch,
                resolvedBaseBranch,
            });
        }
    }

    warnCrossLumpBaseBranchMismatches({ lumps: registry, logger });
    return success(undefined);
}
