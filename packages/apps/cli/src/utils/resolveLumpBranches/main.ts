import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { LumpJsConfig } from '../../types/LumpJsConfig';
import type { LocalConfig } from '../../types/LocalConfig';
import type { Mode } from '../../types/Mode';
import { branchMatchesGitGlob } from '../branchMatchesGitGlob';
import { isGitRefGlob } from '../isGitRefGlob';
import { resolvePrimaryBranch } from '../resolvePrimaryBranches';

export type DiscoveryRulesConfig = Pick<LumpJsConfig, 'discoveryBranch' | 'discoveryBranches'>;

/**
 * Normalize singular/plural discovery fields to a rule list.
 * Mutual exclusion → Failure. Omit both → exact primary.
 */
export function normalizeDiscoveryRules(input: {
    lumpConfig: DiscoveryRulesConfig;
    primaryBranch: string;
}): Success<string[]> | Failure<string> {
    const { discoveryBranch, discoveryBranches } = input.lumpConfig;
    const hasSingular = discoveryBranch !== undefined;
    const hasPlural = discoveryBranches !== undefined;

    if (hasSingular && hasPlural) {
        return failure(
            'discoveryBranch and discoveryBranches are mutually exclusive; set only one',
        );
    }
    if (hasPlural) {
        return success([...discoveryBranches!]);
    }
    if (hasSingular) {
        return success([discoveryBranch!]);
    }
    return success([input.primaryBranch]);
}

/** True when concrete scan/flag branch matches any discovery rule. */
export function discoveryRulesMatchScanBranch(input: {
    rules: string[];
    scanBranch: string;
}): boolean {
    return input.rules.some((rule) =>
        isGitRefGlob(rule)
            ? branchMatchesGitGlob({ pattern: rule, branch: input.scanBranch })
            : rule === input.scanBranch,
    );
}

/** First exact rule, or undefined when pattern-only. */
export function firstExactDiscoveryRule(rules: string[]): string | undefined {
    return rules.find((rule) => !isGitRefGlob(rule));
}

/**
 * Flagless concrete discovery for a lump: first exact rule, or Failure when pattern-only.
 * Shared mode always returns primary.
 */
export function resolveLumpDiscoveryBranch(input: {
    lumpConfig: DiscoveryRulesConfig;
    primaryBranch: string;
    mode?: Mode;
}): string {
    if (input.mode === 'shared') {
        return input.primaryBranch;
    }
    const rulesResult = normalizeDiscoveryRules({
        lumpConfig: input.lumpConfig,
        primaryBranch: input.primaryBranch,
    });
    if (!rulesResult.success) {
        throw new Error(rulesResult.data);
    }
    const firstExact = firstExactDiscoveryRule(rulesResult.data);
    if (firstExact === undefined) {
        throw new Error(
            'Lump discovery rules are pattern-only; pass --discoveryBranch <concrete branch>',
        );
    }
    return firstExact;
}

export function resolveLumpBaseBranch(input: {
    lumpConfig: Pick<LumpJsConfig, 'baseBranch' | 'discoveryBranch' | 'discoveryBranches'>;
    primaryBranch: string;
    mode?: Mode;
    /** When set (CLI bind), omitted baseBranch falls back to this concrete discovery. */
    effectiveDiscoveryBranch?: string;
}): string {
    const { lumpConfig, primaryBranch, mode, effectiveDiscoveryBranch } = input;
    if (typeof lumpConfig.baseBranch === 'string') {
        return lumpConfig.baseBranch;
    }
    // Fn / FilePath baseBranch is resolved at jsConfigToRunLumpInput bind time.
    if (effectiveDiscoveryBranch !== undefined) {
        return effectiveDiscoveryBranch;
    }
    if (mode !== 'shared') {
        const rulesResult = normalizeDiscoveryRules({
            lumpConfig,
            primaryBranch,
        });
        if (rulesResult.success) {
            const firstExact = firstExactDiscoveryRule(rulesResult.data);
            if (firstExact !== undefined) {
                return firstExact;
            }
        }
        if (lumpConfig.discoveryBranch !== undefined && !isGitRefGlob(lumpConfig.discoveryBranch)) {
            return lumpConfig.discoveryBranch;
        }
    }
    return primaryBranch;
}