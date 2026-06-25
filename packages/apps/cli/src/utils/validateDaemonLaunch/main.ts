import { execAsync, failure, type Failure, success, type Success } from '@lumpcode/core';
import type { Logger } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';
import type { LumpJsConfig } from '../../types/LumpJsConfig';
import { discoverLoadableLumpNames } from '../discoverLoadableLumpNames';
import { getJsConfigFromLumpName } from '../getJsConfigFromLumpName';
import { resolvePrimaryProjectBaseBranch, resolveProjectBaseBranches } from '../resolveProjectBaseBranches';
import { runProjectPreflight } from '../runProjectPreflight';
import { validateLumpBaseBranchAllowlist } from '../validateLumpBaseBranchAllowlist';

export type DaemonLumpRegistryEntry = {
    lumpName: string;
    integrationBranch: string;
    resolvedBaseBranch: string;
};

async function listTrackedLumpNamesOnHead(projectRoot: string): Promise<string[]> {
    const result = await execAsync('git ls-tree -r --name-only HEAD -- .lumpcode/lumps', {
        cwd: projectRoot,
    });
    if (!result.success) return [];

    const names = new Set<string>();
    for (const line of result.data.stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const match = trimmed.match(/^\.lumpcode\/lumps\/([^/]+)\//);
        if (match) names.add(match[1]!);
    }
    return [...names].sort();
}

export async function validateDaemonLaunch(input: {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    localConfig: LocalConfig;
    lumpName?: string;
    logger?: Logger;
}): Promise<Success<void> | Failure<string>> {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath, localConfig, lumpName, logger } = input;
    const effectiveBranches = resolveProjectBaseBranches(localConfig);
    const primaryBranch = resolvePrimaryProjectBaseBranch(localConfig);
    const errors: string[] = [];

    if (lumpName) {
        const jsConfResult = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
        if (!jsConfResult.success) {
            return failure(jsConfResult.data);
        }
        const resolvedBaseBranch = jsConfResult.data.baseBranch ?? primaryBranch;
        const allowlistResult = validateLumpBaseBranchAllowlist({
            lumpName,
            resolvedBaseBranch,
            effectiveBranches,
            allowUnlistedBaseBranch: jsConfResult.data.allowUnlistedBaseBranch,
        });
        if (!allowlistResult.success) {
            return failure(allowlistResult.data);
        }
        return success(undefined);
    }

    if (localConfig.mode === 'shared') {
        return success(undefined);
    }

    const isMultiBranch = effectiveBranches.length > 1;

    if (isMultiBranch) {
        const registry: DaemonLumpRegistryEntry[] = [];
        const lumpConfigs = new Map<string, LumpJsConfig>();

        for (const branch of effectiveBranches) {
            const preflightResult = await runProjectPreflight({
                sourceProjectRoot: projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
                localConfig,
                targetBranch: branch,
            });
            if (!preflightResult.success) {
                errors.push(`pre-flight for branch "${branch}": ${preflightResult.data}`);
                continue;
            }

            const trackedLumpNames = await listTrackedLumpNamesOnHead(projectRoot);
            for (const trackedLumpName of trackedLumpNames) {
                const jsConfResult = await getJsConfigFromLumpName({
                    lumpName: trackedLumpName,
                    localConfigFolderPath,
                });
                if (!jsConfResult.success) {
                    errors.push(`lump "${trackedLumpName}" on branch "${branch}": ${jsConfResult.data}`);
                }
            }

            const lumpNames = await discoverLoadableLumpNames(localConfigFolderPath);
            const trackedOnHead = new Set(trackedLumpNames);
            for (const discoveredLumpName of lumpNames) {
                const jsConfResult = await getJsConfigFromLumpName({
                    lumpName: discoveredLumpName,
                    localConfigFolderPath,
                });
                if (!jsConfResult.success) {
                    errors.push(`lump "${discoveredLumpName}" on branch "${branch}": ${jsConfResult.data}`);
                    continue;
                }

                const resolvedBaseBranch = jsConfResult.data.baseBranch ?? primaryBranch;
                const allowlistResult = validateLumpBaseBranchAllowlist({
                    lumpName: discoveredLumpName,
                    resolvedBaseBranch,
                    effectiveBranches,
                    allowUnlistedBaseBranch: jsConfResult.data.allowUnlistedBaseBranch,
                });
                if (!allowlistResult.success) {
                    errors.push(allowlistResult.data);
                }

                if (!trackedOnHead.has(discoveredLumpName)) {
                    continue;
                }

                registry.push({
                    lumpName: discoveredLumpName,
                    integrationBranch: branch,
                    resolvedBaseBranch,
                });
                lumpConfigs.set(discoveredLumpName, jsConfResult.data);
            }
        }

        const lumpNameToBranch = new Map<string, string>();
        for (const entry of registry) {
            const existingBranch = lumpNameToBranch.get(entry.lumpName);
            if (existingBranch !== undefined && existingBranch !== entry.integrationBranch) {
                errors.push(
                    `duplicate lump name "${entry.lumpName}" on branches "${existingBranch}" and "${entry.integrationBranch}"`,
                );
            } else {
                lumpNameToBranch.set(entry.lumpName, entry.integrationBranch);
            }
        }

        emitCrossLumpBaseBranchWarnings({
            registry,
            lumpConfigs,
            primaryBranch,
            logger,
        });
    } else {
        const trackedLumpNames = await listTrackedLumpNamesOnHead(projectRoot);
        for (const trackedLumpName of trackedLumpNames) {
            const jsConfResult = await getJsConfigFromLumpName({
                lumpName: trackedLumpName,
                localConfigFolderPath,
            });
            if (!jsConfResult.success) {
                errors.push(`lump "${trackedLumpName}": ${jsConfResult.data}`);
            }
        }

        const lumpNames = await discoverLoadableLumpNames(localConfigFolderPath);
        for (const discoveredLumpName of lumpNames) {
            const jsConfResult = await getJsConfigFromLumpName({
                lumpName: discoveredLumpName,
                localConfigFolderPath,
            });
            if (!jsConfResult.success) {
                errors.push(`lump "${discoveredLumpName}": ${jsConfResult.data}`);
                continue;
            }

            const resolvedBaseBranch = jsConfResult.data.baseBranch ?? primaryBranch;
            const allowlistResult = validateLumpBaseBranchAllowlist({
                lumpName: discoveredLumpName,
                resolvedBaseBranch,
                effectiveBranches,
                allowUnlistedBaseBranch: jsConfResult.data.allowUnlistedBaseBranch,
            });
            if (!allowlistResult.success) {
                errors.push(allowlistResult.data);
            }
        }
    }

    if (errors.length > 0) {
        return failure(errors.join('; '));
    }

    return success(undefined);
}

function emitCrossLumpBaseBranchWarnings(input: {
    registry: DaemonLumpRegistryEntry[];
    lumpConfigs: Map<string, LumpJsConfig>;
    primaryBranch: string;
    logger?: Logger;
}): void {
    const { registry, lumpConfigs, primaryBranch, logger } = input;
    if (!logger) return;

    const baseBranchByLump = new Map<string, string>();
    for (const entry of registry) {
        baseBranchByLump.set(entry.lumpName, entry.resolvedBaseBranch);
    }

    for (const entry of registry) {
        const consumerConfig = lumpConfigs.get(entry.lumpName);
        if (!consumerConfig) continue;

        const deps = extractCrossLumpDependsOnContexts(consumerConfig);
        const consumerBranch = entry.resolvedBaseBranch;

        for (const dep of deps) {
            const slash = dep.indexOf('/');
            if (slash === -1) continue;
            const otherLump = dep.slice(0, slash);
            const providerBranch = baseBranchByLump.get(otherLump);
            if (providerBranch === undefined) continue;
            if (providerBranch !== consumerBranch) {
                logger.warn(
                    `cross-lump dependency warning: lump "${entry.lumpName}" (baseBranch "${consumerBranch}") ` +
                        `depends on "${dep}" but "${otherLump}" uses baseBranch "${providerBranch}"`,
                );
            }
        }
    }

    void primaryBranch;
}

function extractCrossLumpDependsOnContexts(jsConfig: LumpJsConfig): string[] {
    const deps: string[] = [];
    const topLevel = (jsConfig as Record<string, unknown>).dependsOnContexts;
    if (Array.isArray(topLevel)) {
        for (const dep of topLevel) {
            if (typeof dep === 'string' && dep.includes('/')) {
                deps.push(dep);
            }
        }
    }
    return deps;
}
