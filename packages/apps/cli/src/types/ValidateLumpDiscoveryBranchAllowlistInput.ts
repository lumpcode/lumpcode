import type { Mode } from './Mode';

/**
 * Input for {@link validateLumpDiscoveryBranchAllowlist}.
 */
export interface ValidateLumpDiscoveryBranchAllowlistInput {
    mode: Mode;
    lumpName: string;
    resolvedDiscoveryBranch: string;
    effectiveDiscoveryBranches: string[];
}
