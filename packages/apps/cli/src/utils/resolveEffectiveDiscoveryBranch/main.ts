import type { Failure, Logger, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';
import { getJsConfigFromLumpName } from '../getJsConfigFromLumpName';
import { isGitRefGlob } from '../isGitRefGlob';
import {
    discoveryRulesMatchScanBranch,
    firstExactDiscoveryRule,
    normalizeDiscoveryRules,
} from '../resolveLumpBranches';
import { resolvePrimaryBranch, resolvePrimaryBranches } from '../resolvePrimaryBranches';
import { validateLumpDiscoveryBranchAllowlist } from '../validateLumpDiscoveryBranchAllowlist';

export async function resolveEffectiveDiscoveryBranch(input: {
    discoveryBranchOpt?: string;
    lumpName: string;
    localConfigFolderPath: string;
    localConfig: LocalConfig;
    logger?: Logger;
    /** When true, log once if discoveryBranchOpt is ignored in shared mode. */
    warnSharedDiscoveryBranchIgnored?: boolean;
}): Promise<Success<string> | Failure<string>> {
    const {
        discoveryBranchOpt,
        lumpName,
        localConfigFolderPath,
        localConfig,
        logger,
        warnSharedDiscoveryBranchIgnored = false,
    } = input;

    const trimmedOpt = discoveryBranchOpt?.trim();

    let primaryBranch: string;
    try {
        primaryBranch = resolvePrimaryBranch(localConfig, logger);
    } catch (err) {
        return failure(err instanceof Error ? err.message : String(err));
    }

    if (trimmedOpt && localConfig.mode === 'shared') {
        if (warnSharedDiscoveryBranchIgnored) {
            logger?.info(
                '--discoveryBranch is ignored in shared mode; discovery workspace state is operator-managed.',
            );
        }
    }

    if (localConfig.mode === 'shared') {
        return success(primaryBranch);
    }

    const effectivePrimaryBranches = resolvePrimaryBranches(localConfig, logger);

    if (trimmedOpt) {
        if (isGitRefGlob(trimmedOpt)) {
            return failure(
                `--discoveryBranch must be a concrete branch name, not a pattern (got "${trimmedOpt}")`,
            );
        }

        const allowlistResult = validateLumpDiscoveryBranchAllowlist({
            mode: localConfig.mode,
            lumpName,
            resolvedDiscoveryBranch: trimmedOpt,
            effectivePrimaryBranches,
        });
        if (!allowlistResult.success) {
            return failure(allowlistResult.data);
        }

        const jsConfResult = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
        if (!jsConfResult.success) {
            return failure(jsConfResult.data);
        }

        const rulesResult = normalizeDiscoveryRules({
            lumpConfig: jsConfResult.data,
            primaryBranch,
        });
        if (!rulesResult.success) {
            return failure(rulesResult.data);
        }

        if (
            !discoveryRulesMatchScanBranch({
                rules: rulesResult.data,
                scanBranch: trimmedOpt,
            })
        ) {
            return failure(
                `Lump "${lumpName}" discovery rules [${rulesResult.data.join(', ')}] ` +
                    `do not match --discoveryBranch "${trimmedOpt}"`,
            );
        }

        return success(trimmedOpt);
    }

    const jsConfResult = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
    if (!jsConfResult.success) {
        return failure(jsConfResult.data);
    }

    const rulesResult = normalizeDiscoveryRules({
        lumpConfig: jsConfResult.data,
        primaryBranch,
    });
    if (!rulesResult.success) {
        return failure(rulesResult.data);
    }

    const firstExact = firstExactDiscoveryRule(rulesResult.data);
    if (firstExact === undefined) {
        return failure(
            `Lump "${lumpName}" discovery rules are pattern-only; pass --discoveryBranch <concrete branch>`,
        );
    }

    const allowlistResult = validateLumpDiscoveryBranchAllowlist({
        mode: localConfig.mode,
        lumpName,
        resolvedDiscoveryBranch: firstExact,
        effectivePrimaryBranches,
    });
    if (!allowlistResult.success) {
        return failure(allowlistResult.data);
    }

    return success(firstExact);
}
